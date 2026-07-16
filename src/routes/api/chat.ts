import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const EMBED_MODEL = "gemini-embedding-001";
// Native output is 3072 dims, which exceeds pgvector's 2000-dim cap for HNSW
// indexes — truncated to 768 via output_dimensionality to match the existing
// document_chunks.embedding column (and to keep the HNSW index usable).
const EMBED_DIMENSIONS = 768;
const CHAT_MODEL = "gemini-3.1-flash-lite";

function toGeminiRole(role: string) {
  return role === "assistant" ? "model" : "user";
}

// Truncated (non-3072) gemini-embedding-001 output isn't pre-normalized, but
// match_chunks compares vectors with cosine distance — normalize so similarity
// scores stay meaningful.
function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
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

// Retry with exponential backoff on rate limits / transient server errors —
// a safety net for chat generation now that it runs on a lower-tier model.
// Only safe to apply before the stream body is read (checked via res.ok here,
// prior to any chunk consumption), never mid-stream.
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

type SourceRef = {
  chunk_id: string;
  document_id: string;
  filename: string;
  chunk_index: number;
  snippet: string;
  similarity: number;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice(7);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
          return new Response("Missing GEMINI_API_KEY", { status: 500 });
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub as string;

        const body = (await request.json()) as { threadId?: string; question?: string };
        const threadId = body.threadId;
        const question = body.question?.trim();
        if (!threadId || !question) {
          return new Response("Bad Request", { status: 400 });
        }

        // Save user message
        await supabase.from("messages").insert({
          thread_id: threadId,
          user_id: userId,
          role: "user",
          content: question,
        });

        // Embed question
        const embedRes = await fetch(`${GEMINI_BASE}/models/${EMBED_MODEL}:embedContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
          },
          body: JSON.stringify({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text: question }] },
            outputDimensionality: EMBED_DIMENSIONS,
          }),
        });
        if (!embedRes.ok) {
          return new Response(`Embedding failed: ${await embedRes.text()}`, { status: 500 });
        }
        const embedData = (await embedRes.json()) as {
          embedding: { values: number[] };
        };
        const queryEmbedding = normalize(embedData.embedding.values);

        // Match chunks (top 5)
        const { data: matches, error: mErr } = await supabase.rpc("match_chunks", {
          query_embedding: `[${queryEmbedding.join(",")}]` as unknown as string,
          match_count: 12,
          owner_id: userId,
        });
        if (mErr) return new Response(mErr.message, { status: 500 });

        const rows = (matches ?? []) as Array<{
          id: string;
          document_id: string;
          chunk_index: number;
          content: string;
          similarity: number;
        }>;

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

        // Prior history (last 10)
        const { data: history } = await supabase
          .from("messages")
          .select("role, content")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: false })
          .limit(10);
        const prior = [...(history ?? [])].reverse();

        const context_text = sources.length
          ? sources
              .map(
                (s, i) =>
                  `[${i + 1}] Source: ${s.filename} (chunk ${s.chunk_index})\n${s.snippet}`,
              )
              .join("\n\n---\n\n")
          : "No relevant sources were found.";

        const systemPrompt = `You are Cortex, a warm, knowledgeable personal AI assistant helping the user reason over their uploaded notes and documents.

ANSWER QUALITY PRINCIPLES:
1. Calibrate length to the question. A brief factual question ("what is X", "when did Y happen") gets a direct 1-2 sentence answer — never pad it. An open-ended question ("tell me about X", "explain Y") gets a fuller, well-organized answer — never truncate detail that's genuinely there. Match depth to what was actually asked.
2. Lead with the direct answer first, then supporting detail. Don't bury the point under preamble or setup.
3. Use structure (bullets/headings) only when the content is genuinely list-like — multiple distinct items, facts, or steps. For narrative or single-topic answers, use clean prose instead of forcing bullets onto it.
4. Always include the real specifics from the documents — exact names, numbers, dates, titles. Never substitute a vague generalization when the source has precise details.
5. Citations: exactly ONE number per bracket, like [2][4][6] — NEVER combine multiple numbers into a single bracket like [2, 4, 6]. Place each citation immediately after the specific claim it supports, not clustered at the end of a paragraph. Only cite numbers that match an actual numbered CONTEXT snippet given to you below; never invent a number, renumber the snippets, or cite a number that wasn't provided.
6. Decide how well the user's documents cover the question:
   - If the documents FULLY answer it: answer directly, grounded with citations placed at the point of each claim.
   - If the documents PARTIALLY answer it OR do not cover it at all: structure your reply in two clearly labeled parts:
       **Based on your documents:** <what the docs do say, with citations — or "your uploaded documents don't directly address this" if truly nothing relevant>
       **Beyond your documents:** <a helpful answer from general knowledge, clearly framed as outside the user's notes, matched in depth to the question>
7. No filler: never restate the question, never open with a hedge like "it appears that" or "based on the information provided" unless the source material is genuinely ambiguous or conflicting.
8. NEVER refuse with "I don't have information on that" or a dead-end. Always give the user something useful — either from their docs, from general knowledge, or both.
9. Use markdown where it earns its place: **bold** for key terms and labels, bullet lists only for genuinely enumerable facts, code blocks for code. Otherwise, clean prose.

CONTEXT (the user's retrieved document snippets):
${context_text}`;

        // Stream from Gemini
        const chatRes = await fetchWithRetry(
          `${GEMINI_BASE}/models/${CHAT_MODEL}:streamGenerateContent?alt=sse`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GEMINI_API_KEY,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: prior.map((m) => ({
                role: toGeminiRole(m.role),
                parts: [{ text: m.content }],
              })),
            }),
          },
        );
        if (!chatRes.ok || !chatRes.body) {
          return new Response(`Chat failed: ${await chatRes.text()}`, { status: 500 });
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
          async start(controller) {
            // Emit sources first
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "sources", sources }) + "\n"),
            );

            let full = "";
            const reader = chatRes.body!.getReader();
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith("data:")) continue;
                  const payload = trimmed.slice(5).trim();
                  if (!payload) continue;
                  try {
                    const json = JSON.parse(payload) as {
                      candidates?: { content?: { parts?: { text?: string }[] } }[];
                    };
                    const delta = json.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (delta) {
                      full += delta;
                      controller.enqueue(
                        encoder.encode(
                          JSON.stringify({ type: "delta", text: delta }) + "\n",
                        ),
                      );
                    }
                  } catch {
                    /* ignore parse errors */
                  }
                }
              }

              // Persist assistant message
              await supabase.from("messages").insert({
                thread_id: threadId,
                user_id: userId,
                role: "assistant",
                content: full || "(no answer)",
                sources: JSON.parse(JSON.stringify(sources)),
              });

              // Thread bookkeeping
              const { data: thread } = await supabase
                .from("threads")
                .select("title")
                .eq("id", threadId)
                .single();
              const updates: { updated_at: string; title?: string } = {
                updated_at: new Date().toISOString(),
              };
              if (thread?.title === "New chat") {
                updates.title = question.slice(0, 60);
              }
              await supabase.from("threads").update(updates).eq("id", threadId);

              controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
              controller.close();
            } catch (err) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "error",
                    message: errorMessage(err),
                  }) + "\n",
                ),
              );
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
