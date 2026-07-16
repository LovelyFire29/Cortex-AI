import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const EMBED_MODEL = "gemini-embedding-001";
// Native output is 3072 dims, which exceeds pgvector's 2000-dim cap for HNSW
// indexes — truncated to 768 via output_dimensionality to match the existing
// document_chunks.embedding column (and to keep the HNSW index usable).
const EMBED_DIMENSIONS = 768;
const CHAT_MODEL = "gemini-3.1-flash-lite";

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("Missing GEMINI_API_KEY");
  return k;
}

function toGeminiRole(role: string) {
  return role === "assistant" ? "model" : "user";
}

// Retry with exponential backoff on rate limits / transient server errors —
// a safety net for chat generation now that it runs on a lower-tier model.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts = 3,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok || attempt === maxAttempts - 1 || (res.status !== 429 && res.status < 500)) {
      return res;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
}

// Not every thrown value is an Error instance — Supabase errors (PostgrestError)
// are plain objects with a `.message`, so String(e) would otherwise yield
// "[object Object]" instead of something readable.
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") {
    return e.message;
  }
  return String(e);
}

// Truncated (non-3072) gemini-embedding-001 output isn't pre-normalized, but
// match_chunks compares vectors with cosine distance — normalize so similarity
// scores stay meaningful.
function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}

async function embed(inputs: string[]): Promise<number[][]> {
  const res = await fetch(`${GEMINI_BASE}/models/${EMBED_MODEL}:batchEmbedContents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key(),
    },
    body: JSON.stringify({
      requests: inputs.map((text) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBED_DIMENSIONS,
      })),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { embeddings: { values: number[] }[] };
  return data.embeddings.map((e) => normalize(e.values));
}

function chunkText(text: string, target = 800, overlap = 200): string[] {
  const cleaned = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];
  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > target && current) {
      chunks.push(current.trim());
      const tail = current.slice(Math.max(0, current.length - overlap));
      current = tail + "\n\n" + p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  // Ensure no chunk is way too big
  const final: string[] = [];
  for (const c of chunks) {
    if (c.length <= target * 1.5) {
      final.push(c);
    } else {
      for (let i = 0; i < c.length; i += target) final.push(c.slice(i, i + target));
    }
  }
  return final;
}

export const ingestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        filename: z.string().min(1).max(300),
        mimeType: z.string().max(200),
        sizeBytes: z.number().int().nonnegative(),
        text: z.string().min(1).max(2_000_000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        user_id: userId,
        filename: data.filename,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        status: "processing",
      })
      .select()
      .single();
    if (error || !doc) throw new Error(error?.message ?? "Insert failed");

    try {
      const chunks = chunkText(data.text);
      if (chunks.length === 0) throw new Error("Document is empty after parsing");

      // batch embeddings, max 96 per call (safe under 100 cap)
      const BATCH = 64;
      const rows: {
        document_id: string;
        user_id: string;
        chunk_index: number;
        content: string;
        embedding: string;
      }[] = [];
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);
        const vectors = await embed(slice);
        vectors.forEach((v, j) => {
          rows.push({
            document_id: doc.id,
            user_id: userId,
            chunk_index: i + j,
            content: slice[j],
            embedding: `[${v.join(",")}]`,
          });
        });
      }

      const { error: insErr } = await supabase.from("document_chunks").insert(rows);
      if (insErr) throw insErr;

      await supabase
        .from("documents")
        .update({ status: "ready", chunk_count: rows.length })
        .eq("id", doc.id);

      return { ok: true, documentId: doc.id, chunks: rows.length };
    } catch (e) {
      const msg = errorMessage(e);
      await supabase
        .from("documents")
        .update({ status: "failed", error: msg })
        .eq("id", doc.id);
      throw new Error(msg);
    }
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("documents")
      .select("id, filename, mime_type, size_bytes, status, error, chunk_count, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .insert({ user_id: context.userId, title: "New chat" })
      .select()
      .single();
    if (error || !data) throw new Error(error?.message ?? "Create thread failed");
    return data;
  });

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .select("id, title, updated_at, created_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("threads").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ threadId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: msgs, error } = await context.supabase
      .from("messages")
      .select("id, role, content, sources, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return msgs ?? [];
  });

type SourceRef = {
  chunk_id: string;
  document_id: string;
  filename: string;
  chunk_index: number;
  snippet: string;
  similarity: number;
};

export const askQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        question: z.string().min(1).max(4000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Save user message
    const { error: umErr } = await supabase.from("messages").insert({
      thread_id: data.threadId,
      user_id: userId,
      role: "user",
      content: data.question,
    });
    if (umErr) throw umErr;

    // Embed the question
    const [queryEmbedding] = await embed([data.question]);

    // Similarity search
    const { data: matches, error: mErr } = await supabase.rpc("match_chunks", {
      query_embedding: `[${queryEmbedding.join(",")}]` as unknown as string,
      match_count: 6,
      owner_id: userId,
    });
    if (mErr) throw mErr;

    const rows =
      (matches as Array<{
        id: string;
        document_id: string;
        chunk_index: number;
        content: string;
        similarity: number;
      }>) ?? [];

    // Fetch filenames for the matched documents
    const docIds = [...new Set(rows.map((r) => r.document_id))];
    const docMap: Record<string, string> = {};
    if (docIds.length) {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, filename")
        .in("id", docIds);
      (docs ?? []).forEach((d) => (docMap[d.id] = d.filename));
    }

    const sources: SourceRef[] = rows.map((r) => ({
      chunk_id: r.id,
      document_id: r.document_id,
      filename: docMap[r.document_id] ?? "Untitled",
      chunk_index: r.chunk_index,
      snippet: r.content,
      similarity: r.similarity,
    }));

    // Recent thread history (last 8 messages, excluding the just-inserted user one? include it)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: false })
      .limit(10);
    const priorMessages = [...(history ?? [])].reverse();

    const context_text = sources.length
      ? sources
          .map(
            (s, i) =>
              `[${i + 1}] Source: ${s.filename} (chunk ${s.chunk_index})\n${s.snippet}`,
          )
          .join("\n\n---\n\n")
      : "No relevant sources were found in the user's uploaded documents.";

    const systemPrompt = `You are Cortex, a personal AI knowledge assistant. Answer the user's question using ONLY the context snippets below when relevant. Calibrate length to the question: brief factual questions get a direct 1-2 sentence answer (never padded); open-ended questions get a fuller, organized answer (never truncated). Lead with the direct answer, then supporting detail. Use bullets/headings only when the content is genuinely list-like; otherwise use clean prose. Always include real specifics (names, numbers, dates, titles) from the documents rather than vague generalizations. Citations: exactly ONE number per bracket, like [2][4][6] — NEVER combine multiple numbers into a single bracket like [2, 4, 6] — placed immediately after the claim it supports. Only cite numbers matching an actual numbered snippet given below; never invent a number, renumber the snippets, or cite one that wasn't provided. If the answer isn't in the context, say so plainly and answer briefly from general knowledge, marking that clearly. No filler: don't restate the question, avoid hedges like "it appears that" unless the source is genuinely ambiguous.\n\nCONTEXT:\n${context_text}`;

    const chatRes = await fetchWithRetry(`${GEMINI_BASE}/models/${CHAT_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: priorMessages.map((m) => ({
          role: toGeminiRole(m.role),
          parts: [{ text: m.content }],
        })),
      }),
    });
    if (!chatRes.ok) {
      const t = await chatRes.text();
      throw new Error(`Chat failed (${chatRes.status}): ${t}`);
    }
    const chatData = (await chatRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const answer = chatData.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no answer)";

    // Save assistant message
    const { data: assistantMsg, error: amErr } = await supabase
      .from("messages")
      .insert({
        thread_id: data.threadId,
        user_id: userId,
        role: "assistant",
        content: answer,
        sources: JSON.parse(JSON.stringify(sources)),
      })
      .select()
      .single();
    if (amErr) throw amErr;

    // Update thread title/updated_at
    const updates: { updated_at: string; title?: string } = {
      updated_at: new Date().toISOString(),
    };
    // If title is default and this is first user message, use question as title
    const { data: thread } = await supabase
      .from("threads")
      .select("title")
      .eq("id", data.threadId)
      .single();
    if (thread && thread.title === "New chat") {
      updates.title = data.question.slice(0, 60);
    }
    await supabase.from("threads").update(updates).eq("id", data.threadId);

    return { assistant: assistantMsg, sources };
  });
