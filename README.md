# Cortex — Your Personal AI Memory

A private, retrieval-augmented knowledge assistant. Upload your notes and documents, ask questions in plain language, and get answers grounded in your own words — with the exact source passage cited underneath every claim.

Cortex also exposes itself as an **MCP (Model Context Protocol) server**, so Claude Desktop, Claude Code, or ChatGPT can query your personal knowledge base directly.

**Live demo:** https://cortex29.vercel.app
**Repo:** https://github.com/LovelyFire29/Cortex-AI

---

## Features

- **Document ingestion** — upload `.txt`, `.md`, and `.pdf` files; each is parsed, chunked, and embedded into a private, per-user knowledge base
- **Grounded chat** — ask natural-language questions and get answers synthesized from your own documents, with inline numbered citations linking back to the exact source chunk
- **Honest fallback behavior** — when your documents don't cover a question, the assistant clearly separates "based on your documents" from "beyond your documents" (general knowledge), rather than refusing or guessing silently
- **MCP server integration** — two tools (`search_documents`, `ask_knowledge_base`) exposed over HTTP with OAuth-protected access, so external AI clients can query your knowledge base as *you*, scoped only to your own data
- **Full auth** — email/password and Google OAuth via Supabase Auth
- **Mobile-responsive UI** — usable from phone or desktop

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TanStack Start (file-based routing), Tailwind CSS |
| Backend | TanStack Start server functions, streaming API routes |
| Database | Supabase (Postgres) with `pgvector` for embeddings, Row-Level Security for per-user data isolation |
| AI | Google Gemini API — `gemini-embedding-001` for embeddings, `gemini-3.1-flash-lite` for chat generation |
| Retrieval | Cosine similarity search via `pgvector` HNSW index, top-12 chunk retrieval per query |
| Protocol | MCP (Model Context Protocol) server with OAuth 2.0, for use in Claude Desktop / Claude Code / ChatGPT |
| Deployment | Vercel |

## How It Works

1. **Ingest** — documents are parsed and split into ~800-character overlapping chunks, then embedded via Gemini's embedding model (truncated to 768 dimensions using Matryoshka Representation Learning) and stored in Postgres with `pgvector`.
2. **Retrieve** — a user's question is embedded the same way, then compared against stored chunks using cosine similarity (`pgvector` HNSW index) to find the most relevant passages, scoped to that user via Row-Level Security.
3. **Generate** — the top-ranked chunks are passed to Gemini along with the question. The model is instructed to synthesize an answer strictly from the provided context, cite sources inline (`[1]`, `[2]`, ...), and fall back to general knowledge — clearly labeled — when the documents don't cover the question.
4. **MCP** — the same retrieval/generation pipeline is exposed as MCP tools, authenticated via OAuth, so any MCP-compatible client can call it directly on the user's behalf.

## Local Development

```bash
git clone https://github.com/LovelyFire29/Cortex-AI.git
cd Cortex-AI
npm install
```

Create a `.env` file (see `.env.example`) with:

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
GEMINI_API_KEY=
```

Run the database migrations (in `supabase/migrations/`) against your own Supabase project via the SQL Editor, then:

```bash
npm run dev
```

## Connecting to Claude or ChatGPT

Once deployed (or running locally), go to the **Connect** page in the app for step-by-step instructions to add Cortex as an MCP connector in Claude Desktop, Claude Code, or ChatGPT's developer mode.

## Author

**Srinivasa Raghavan S**
[GitHub](https://github.com/LovelyFire29) · [LinkedIn](https://linkedin.com/in/srinivasaraghavan29)

Built as a personal project exploring RAG architecture and the Model Context Protocol.
