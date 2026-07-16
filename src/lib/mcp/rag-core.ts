// Shared RAG helpers for MCP tools. All env reads happen inside these functions,
// called from MCP tool handlers — never at module top-level.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

// Truncated (non-3072) gemini-embedding-001 output isn't pre-normalized, but
// match_chunks compares vectors with cosine distance — normalize so similarity
// scores stay meaningful.
function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
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

export function userSupabase(token: string) {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(`${GEMINI_BASE}/models/${EMBED_MODEL}:embedContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key(),
    },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBED_DIMENSIONS,
    }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${await res.text()}`);
  const data = (await res.json()) as { embedding: { values: number[] } };
  return normalize(data.embedding.values);
}

export type MatchedSource = {
  chunk_id: string;
  document_id: string;
  filename: string;
  chunk_index: number;
  snippet: string;
  similarity: number;
};

export async function retrieveChunks(
  supabase: ReturnType<typeof userSupabase>,
  userId: string,
  query: string,
  matchCount: number,
): Promise<MatchedSource[]> {
  const queryEmbedding = await embedQuery(query);
  const { data: matches, error } = await supabase.rpc("match_chunks", {
    query_embedding: `[${queryEmbedding.join(",")}]` as unknown as string,
    match_count: matchCount,
    owner_id: userId,
  });
  if (error) throw new Error(error.message);
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
  return rows.map((r) => ({
    chunk_id: r.id,
    document_id: r.document_id,
    filename: docMap[r.document_id] ?? "Untitled",
    chunk_index: r.chunk_index,
    snippet: r.content,
    similarity: r.similarity,
  }));
}

export async function generateAnswer(
  question: string,
  sources: MatchedSource[],
): Promise<string> {
  const contextText = sources.length
    ? sources
        .map(
          (s, i) =>
            `[${i + 1}] Source: ${s.filename} (chunk ${s.chunk_index})\n${s.snippet}`,
        )
        .join("\n\n---\n\n")
    : "No relevant sources were found in the user's uploaded documents.";

  const systemPrompt = `You are Cortex, a warm, knowledgeable personal AI assistant helping the user reason over their uploaded notes and documents.

ANSWER QUALITY PRINCIPLES:
1. Calibrate length to the question — a brief factual question gets a direct 1-2 sentence answer (never padded); an open-ended question gets a fuller, organized answer (never truncated).
2. Lead with the direct answer first, then supporting detail — no preamble.
3. Use structure (bullets/headings) only when the content is genuinely list-like. Use clean prose for narrative or single-topic answers.
4. Always include real specifics from the documents — exact names, numbers, dates, titles — never vague generalizations when the source has precise details.
5. Citations: exactly ONE number per bracket, like [2][4][6] — NEVER combine multiple numbers into a single bracket like [2, 4, 6]. Place each citation immediately after the claim it supports. Only cite numbers matching an actual numbered CONTEXT snippet given below; never invent a number, renumber the snippets, or cite one that wasn't provided.
6. Decide coverage:
   - Fully covered: direct answer, grounded with citations at the point of each claim.
   - Partial or none: two labeled parts —
       **Based on your documents:** <what the docs say, with citations — or state they don't address this>
       **Beyond your documents:** <helpful general-knowledge answer, clearly framed as outside the user's notes, matched in depth to the question>
7. No filler: don't restate the question, avoid hedges like "it appears that" unless the source is genuinely ambiguous.
8. NEVER refuse with "I don't have information on that". Always give something useful.
9. Use markdown where it earns its place: **bold** for labels, bullets only for genuinely enumerable facts, code blocks for code. Otherwise clean prose.

CONTEXT:
${contextText}`;

  const res = await fetchWithRetry(`${GEMINI_BASE}/models/${CHAT_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key(),
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
    }),
  });
  if (!res.ok) throw new Error(`Chat failed: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no answer)";
}
