import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchDocuments from "./tools/search-documents";
import askKnowledgeBase from "./tools/ask-knowledge-base";

// The OAuth issuer MUST be the direct Supabase host — the `.lovable.cloud` proxy
// is rejected by mcp-js (RFC 8414 issuer mismatch). VITE_SUPABASE_PROJECT_ID is
// inlined by Vite at build time; the fallback only appears during throwaway
// manifest-extract evaluation.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "cortex-knowledge-base",
  title: "Cortex — Personal Knowledge Base",
  version: "0.1.0",
  instructions:
    "Tools to search and query the signed-in Cortex user's uploaded personal notes and documents. Use `search_documents` for raw semantic search over chunks, and `ask_knowledge_base` for a full RAG answer with citations that falls back to general knowledge when the notes don't cover the question.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchDocuments, askKnowledgeBase],
});
