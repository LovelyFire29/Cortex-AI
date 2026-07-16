import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDocuments, listMessages } from "@/lib/rag.functions";
import { supabase } from "@/integrations/supabase/client";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, FileText, ChevronDown, AlertCircle, RefreshCw, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { BrandMark } from "@/components/BrandMark";
import { fileMeta } from "@/lib/file-icon";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ChatThread,
});

type Source = {
  chunk_id: string;
  document_id: string;
  filename: string;
  chunk_index: number;
  snippet: string;
  similarity: number;
};

type Message = {
  id: string;
  role: string;
  content: string;
  sources: Source[] | null;
  created_at: string;
};

function ChatThread() {
  const { threadId } = Route.useParams();
  const listMsgs = useServerFn(listMessages);
  const listDocs = useServerFn(listDocuments);
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [optimisticUser, setOptimisticUser] = useState<Message | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState<string>("");
  const [streamingSources, setStreamingSources] = useState<Source[] | null>(null);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages, refetch } = useQuery({
    queryKey: ["messages", threadId],
    queryFn: () => listMsgs({ data: { threadId } }),
  });
  const { data: documents, isLoading: isLoadingDocs } = useQuery({
    queryKey: ["documents"],
    queryFn: () => listDocs(),
  });
  const hasDocuments = (documents?.length ?? 0) > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, optimisticUser, streamingAnswer, pending]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, pending]);

  async function submit(e?: React.FormEvent, retryText?: string) {
    e?.preventDefault();
    const q = (retryText ?? input).trim();
    if (!q || pending) return;
    if (!retryText) setInput("");
    setPending(true);
    setStreamingAnswer("");
    setStreamingSources(null);
    setFailedQuestion(null);
    setOptimisticUser({
      id: "optimistic-user",
      role: "user",
      content: q,
      sources: null,
      created_at: new Date().toISOString(),
    });
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ threadId, question: q }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          type StreamEvent =
            | { type: "sources"; sources: Source[] }
            | { type: "delta"; text: string }
            | { type: "done" }
            | { type: "error"; message: string };
          let evt: StreamEvent;
          try {
            evt = JSON.parse(line) as StreamEvent;
          } catch {
            continue; // partial/malformed line — wait for more data
          }
          if (evt.type === "sources") setStreamingSources(evt.sources);
          else if (evt.type === "delta") {
            acc += evt.text;
            setStreamingAnswer(acc);
          } else if (evt.type === "error") {
            // Thrown outside the parse try/catch above so it actually
            // propagates to the outer catch instead of being swallowed.
            throw new Error(evt.message);
          }
        }
      }
      await refetch();
      await qc.invalidateQueries({ queryKey: ["threads"] });
      setOptimisticUser(null);
    } catch (err) {
      setFailedQuestion(q);
      toast.error(err instanceof Error ? err.message : "Failed to get answer");
    } finally {
      setPending(false);
      setStreamingAnswer("");
      setStreamingSources(null);
    }
  }

  const all: Message[] = [
    ...((messages as Message[] | undefined) ?? []),
    ...(optimisticUser ? [optimisticUser] : []),
    ...(pending && streamingAnswer
      ? [
          {
            id: "streaming",
            role: "assistant",
            content: streamingAnswer,
            sources: streamingSources,
            created_at: new Date().toISOString(),
          } as Message,
        ]
      : []),
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-10">
          {all.length === 0 && !pending && !isLoadingDocs && !hasDocuments ? (
            <div className="py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <p className="mt-5 text-lg font-semibold tracking-tight">No documents yet</p>
              <p className="mt-1.5 max-w-xs mx-auto text-base text-muted-foreground md:text-sm">
                Upload a note, markdown file, or PDF first — then come back and ask about it.
              </p>
              <Button asChild className="mt-5">
                <Link to="/upload">
                  <Upload className="mr-2 h-4 w-4" /> Upload a document
                </Link>
              </Button>
            </div>
          ) : all.length === 0 && !pending ? (
            <div className="py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card text-primary">
                <BrandMark className="h-6 w-6" />
              </div>
              <p className="mt-5 text-lg font-semibold tracking-tight">
                What would you like to know?
              </p>
              <p className="mt-1.5 text-base text-muted-foreground md:text-sm">
                Ask a question and I'll find the answer in your notes.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {all.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {pending && !streamingAnswer && <TypingIndicator />}
              {failedQuestion && !pending && (
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive md:h-8 md:w-8">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-destructive">
                      Couldn't get an answer
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Something went wrong reaching Cortex. Your question wasn't lost.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => submit(undefined, failedQuestion)}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={submit}
        className="shrink-0 border-t border-border bg-background/90 p-3 backdrop-blur md:p-4"
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <div className="relative min-w-0 flex-1">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask a question about your documents…"
              className="min-h-[56px] resize-none rounded-xl border-border bg-card/60 pr-16 text-base leading-relaxed shadow-sm transition-colors focus-visible:border-primary/40 md:text-sm"
              disabled={pending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={pending || !input.trim()}
              aria-label="Send message"
              className="absolute bottom-2 right-2 h-11 w-11 rounded-lg md:h-10 md:w-10"
            >
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground/70">
          Answers are grounded in your uploaded documents.
        </p>
      </form>
    </div>
  );
}


function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [expandedSources, setExpandedSources] = useState(false);
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const sourcesRef = useRef<HTMLDivElement>(null);

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-[17px] leading-relaxed text-primary-foreground shadow-sm md:text-[15px]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  const sources = message.sources ?? [];

  const handleCitationClick = (n: number) => {
    const src = sources[n - 1];
    if (!src) return;
    setExpandedSources(true);
    setActiveChunkId(src.chunk_id);
    setTimeout(() => {
      const el = document.getElementById(`src-${message.id}-${src.chunk_id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    setTimeout(() => setActiveChunkId(null), 2000);
  };

  return (
    <div className="flex min-w-0 gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary md:h-8 md:w-8">
        <BrandMark className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Cortex
        </p>
        <div className="prose prose-base md:prose-sm dark:prose-invert max-w-none break-words prose-p:leading-relaxed prose-p:my-2 prose-pre:bg-muted prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:text-foreground prose-strong:text-foreground">
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p>{renderCitations(children, sources.length, handleCitationClick)}</p>
              ),
              li: ({ children }) => (
                <li>{renderCitations(children, sources.length, handleCitationClick)}</li>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {sources.length > 0 && (
          <div ref={sourcesRef}>
            <Sources
              messageId={message.id}
              sources={sources}
              keywords={extractKeywords(message.content)}
              expanded={expandedSources}
              onToggle={() => setExpandedSources((v) => !v)}
              activeChunkId={activeChunkId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Convert [1], [2][3] tokens inside text nodes into tappable citation chips.
// Also handles a model grouping multiple citations into one bracket like
// [2, 4, 6] (against the system prompt's instructions, but cheap to tolerate) —
// each number in the group becomes its own separate chip.
function renderCitations(
  children: React.ReactNode,
  max: number,
  onClick: (n: number) => void,
): React.ReactNode {
  return React.Children.map(children, (child, idx) => {
    if (typeof child !== "string") return child;
    const parts: React.ReactNode[] = [];
    const re = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(child)) !== null) {
      const valid = m[1]
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => n >= 1 && n <= max);
      if (valid.length === 0) continue;
      if (m.index > last) parts.push(child.slice(last, m.index));
      valid.forEach((n) => {
        parts.push(
          <button
            key={`c-${idx}-${key++}`}
            type="button"
            onClick={() => onClick(n)}
            className="mx-0.5 inline-flex h-[1.35em] min-w-[1.35em] items-center justify-center rounded-md border border-primary/30 bg-primary/10 px-1 align-baseline font-mono text-[0.72em] font-semibold text-primary no-underline transition-colors hover:border-primary/60 hover:bg-primary/20"
            aria-label={`Jump to source ${n}`}
          >
            {n}
          </button>,
        );
      });
      last = m.index + m[0].length;
    }
    if (last === 0) return child;
    if (last < child.length) parts.push(child.slice(last));
    return parts;
  });
}


function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
        <BrandMark className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1.5 pt-2.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
        <span className="ml-2 text-xs text-muted-foreground">Searching your notes…</span>
      </div>
    </div>
  );
}

type DocGroup = {
  document_id: string;
  filename: string;
  chunks: Array<{ source: Source; number: number }>;
};

function groupByDocument(sources: Source[]): DocGroup[] {
  const map = new Map<string, DocGroup>();
  sources.forEach((s, i) => {
    const existing = map.get(s.document_id);
    const entry = { source: s, number: i + 1 };
    if (existing) existing.chunks.push(entry);
    else
      map.set(s.document_id, {
        document_id: s.document_id,
        filename: s.filename,
        chunks: [entry],
      });
  });
  return Array.from(map.values());
}

function Sources({
  messageId,
  sources,
  keywords,
  expanded,
  onToggle,
  activeChunkId,
}: {
  messageId: string;
  sources: Source[];
  keywords: string[];
  expanded: boolean;
  onToggle: () => void;
  activeChunkId: string | null;
}) {
  const groups = groupByDocument(sources);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
        />
        <span>
          Sources · {groups.length} document{groups.length === 1 ? "" : "s"} ·{" "}
          {sources.length} reference{sources.length === 1 ? "" : "s"}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          {groups.map((g) => (
            <DocGroupCard
              key={g.document_id}
              messageId={messageId}
              group={g}
              keywords={keywords}
              activeChunkId={activeChunkId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DocGroupCard({
  messageId,
  group,
  keywords,
  activeChunkId,
}: {
  messageId: string;
  group: DocGroup;
  keywords: string[];
  activeChunkId: string | null;
}) {
  const { Icon, tone } = fileMeta(group.filename);
  const groupActive = group.chunks.some((c) => c.source.chunk_id === activeChunkId);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  return (
    <div className="rounded-lg border border-border bg-card/40 transition-colors">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center gap-2.5 px-2.5 py-2 text-left"
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tone}`}>
          <Icon className="h-3 w-3" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {group.filename}
        </span>
        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {group.chunks.length} ref{group.chunks.length === 1 ? "" : "s"}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <ul className="border-t border-border">
          {group.chunks.map(({ source, number }) => (
            <ChunkRow
              key={source.chunk_id}
              id={`src-${messageId}-${source.chunk_id}`}
              source={source}
              filename={group.filename}
              number={number}
              keywords={keywords}
              active={activeChunkId === source.chunk_id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChunkRow({
  id,
  source,
  filename,
  number,
  keywords,
  active,
}: {
  id: string;
  source: Source;
  filename: string;
  number: number;
  keywords: string[];
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  const preview = source.snippet.replace(/\s+/g, " ").trim();
  const bestRange = open ? findBestRange(source.snippet, keywords) : null;

  return (
    <li
      id={id}
      className={`border-b border-border/60 last:border-b-0 transition-colors ${
        active ? "bg-primary/10" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left hover:bg-card/70"
        aria-expanded={open}
      >
        <span className="mt-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center rounded border border-border px-1 font-mono text-[9px] font-semibold text-muted-foreground">
          {number}
        </span>
        <span className="min-w-0 flex-1">
          {open ? (
            <>
              <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                <FileText className="h-2.5 w-2.5" />
                <span className="truncate">{filename}</span>
                <span className="text-muted-foreground/50">· chunk {source.chunk_index}</span>
              </span>
              <span className="block whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/80">
                {renderHighlighted(source.snippet, keywords, bestRange)}
              </span>
            </>
          ) : (
            <span className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">
              {preview}
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
          {(source.similarity * 100).toFixed(0)}%
        </span>
      </button>
    </li>
  );
}

// ---- Keyword extraction & highlighting -------------------------------------

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","of","in","on","at","to","for",
  "with","by","from","as","is","are","was","were","be","been","being","this","that",
  "these","those","it","its","they","them","their","there","here","which","who","whom",
  "what","when","where","why","how","not","no","so","do","does","did","done","can",
  "could","should","would","will","shall","may","might","must","have","has","had",
  "about","into","over","under","than","also","such","your","you","our","we","i",
  "based","documents","document","beyond","general","knowledge","note","notes","use",
  "used","using","one","two","some","any","all","more","most","other","because",
  "however","while","between","within","across","upon","only","just","like","very",
]);

function extractKeywords(text: string): string[] {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\[(\d+)\]/g, " ")
    .replace(/[*_#>|~-]+/g, " ")
    .toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cleaned.split(/[^a-z0-9]+/)) {
    if (raw.length < 4) continue;
    if (STOPWORDS.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

// Find the sentence-ish window with highest keyword coverage — the "most relevant" span.
function findBestRange(
  snippet: string,
  keywords: string[],
): { start: number; end: number } | null {
  if (!keywords.length || snippet.length < 40) return null;
  const parts: Array<{ start: number; end: number }> = [];
  const re = /[^.!?\n]+[.!?\n]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(snippet)) !== null) {
    const text = m[0];
    if (text.trim().length < 10) continue;
    parts.push({ start: m.index, end: m.index + text.length });
  }
  if (!parts.length) return null;
  const lower = snippet.toLowerCase();
  let bestScore = 0;
  let best: { start: number; end: number } | null = null;
  for (const p of parts) {
    const sub = lower.slice(p.start, p.end);
    let score = 0;
    for (const k of keywords) if (sub.includes(k)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 2 ? best : null;
}

function renderHighlighted(
  snippet: string,
  keywords: string[],
  bestRange: { start: number; end: number } | null,
): React.ReactNode {
  const segments: Array<{ text: string; emphasized: boolean }> = bestRange
    ? [
        { text: snippet.slice(0, bestRange.start), emphasized: false },
        {
          text: snippet.slice(bestRange.start, bestRange.end),
          emphasized: true,
        },
        { text: snippet.slice(bestRange.end), emphasized: false },
      ]
    : [{ text: snippet, emphasized: false }];

  const wrapKeywords = (text: string, keyPrefix: string): React.ReactNode => {
    if (!keywords.length) return text;
    const escaped = keywords
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const re = new RegExp(`\\b(${escaped})\\b`, "gi");
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let i = 0;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(text)) !== null) {
      if (mm.index > last) nodes.push(text.slice(last, mm.index));
      nodes.push(
        <mark
          key={`${keyPrefix}-${i++}`}
          className="rounded-sm bg-primary/25 px-0.5 text-foreground"
        >
          {mm[0]}
        </mark>,
      );
      last = mm.index + mm[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes.length ? nodes : text;
  };

  return segments.map((seg, i) =>
    seg.emphasized ? (
      <span
        key={`seg-${i}`}
        className="rounded bg-primary/10 ring-1 ring-inset ring-primary/25 px-1 py-0.5"
      >
        {wrapKeywords(seg.text, `hl-${i}`)}
      </span>
    ) : (
      <span key={`seg-${i}`}>{wrapKeywords(seg.text, `hl-${i}`)}</span>
    ),
  );
}

// silence unused import lint when not needed
void FileText;


