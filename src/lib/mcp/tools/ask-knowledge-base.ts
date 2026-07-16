import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { generateAnswer, retrieveChunks, userSupabase } from "../rag-core";

export default defineTool({
  name: "ask_knowledge_base",
  title: "Ask knowledge base",
  description:
    "Ask a question against the signed-in user's uploaded notes. Runs the full RAG pipeline (retrieve top chunks + generate a grounded answer) and answers first from the documents, then from general knowledge if the documents do not cover the question. Returns the answer text and the cited source snippets.",
  inputSchema: {
    question: z.string().min(1).describe("The question to answer."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ question }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated." }],
        isError: true,
      };
    }
    const supabase = userSupabase(ctx.getToken()!);
    const sources = await retrieveChunks(supabase, ctx.getUserId()!, question, 12);
    const answer = await generateAnswer(question, sources);

    const citationBlock = sources.length
      ? "\n\n---\nSources:\n" +
        sources
          .map(
            (s, i) =>
              `[${i + 1}] ${s.filename} (chunk ${s.chunk_index}, similarity ${s.similarity.toFixed(3)})`,
          )
          .join("\n")
      : "";

    return {
      content: [{ type: "text", text: answer + citationBlock }],
      structuredContent: { answer, sources },
    };
  },
});
