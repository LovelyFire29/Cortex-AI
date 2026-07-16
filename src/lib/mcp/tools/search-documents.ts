import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { retrieveChunks, userSupabase } from "../rag-core";

export default defineTool({
  name: "search_documents",
  title: "Search documents",
  description:
    "Semantic search over the signed-in user's uploaded notes and documents. Returns the most relevant text chunks with the source filename and a similarity score.",
  inputSchema: {
    query: z.string().min(1).describe("Natural-language search query."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Maximum number of chunks to return. Defaults to 8."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated." }],
        isError: true,
      };
    }
    const supabase = userSupabase(ctx.getToken()!);
    const sources = await retrieveChunks(supabase, ctx.getUserId()!, query, limit ?? 8);

    if (sources.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No matching chunks found in your uploaded documents.",
          },
        ],
        structuredContent: { results: [] },
      };
    }

    const text = sources
      .map(
        (s, i) =>
          `[${i + 1}] ${s.filename} — chunk ${s.chunk_index} (similarity ${s.similarity.toFixed(3)})\n${s.snippet}`,
      )
      .join("\n\n---\n\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: { results: sources },
    };
  },
});
