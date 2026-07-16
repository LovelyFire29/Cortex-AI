import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listDocuments, deleteDocument } from "@/lib/rag.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trash2,
  Upload,
  CheckCircle2,
  Loader2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { fileMeta } from "@/lib/file-icon";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// A document that's been "processing" longer than this without finishing is
// almost certainly stuck (e.g. the tab closed mid-ingest) rather than just slow.
const STUCK_AFTER_MS = 2 * 60 * 1000;

function Dashboard() {
  const list = useServerFn(listDocuments);
  const del = useServerFn(deleteDocument);
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["documents"],
    queryFn: () => list(),
    refetchInterval: (q) =>
      q.state.data?.some(
        (d) =>
          d.status === "processing" &&
          Date.now() - new Date(d.created_at).getTime() <= STUCK_AFTER_MS,
      )
        ? 1500
        : false,
  });

  async function onDelete(id: string) {
    if (!confirm("Delete this document and all its chunks?")) return;
    try {
      await del({ data: { id } });
      toast.success("Document deleted");
      await refetch();
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // There's no server-side copy of the original file to re-process — only the
  // extracted text ever reaches the server, and that's discarded on failure —
  // so "retry" means clearing the broken record and sending the user back to
  // upload the same file again.
  async function onRetry(id: string) {
    try {
      await del({ data: { id } });
      await refetch();
      router.invalidate();
      toast.message("Removed the failed upload — please re-upload the file.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear this document");
      return;
    }
    router.navigate({ to: "/upload" });
  }

  const total = data?.length ?? 0;
  const ready = data?.filter((d) => d.status === "ready").length ?? 0;
  const processing = data?.filter((d) => d.status === "processing").length ?? 0;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-8 overflow-x-hidden overflow-y-auto p-6 md:p-10">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Library
          </p>
          <h1 className="mt-1 max-w-full break-words text-3xl font-semibold tracking-tight">Your knowledge base</h1>
          <p className="mt-2 max-w-lg break-words text-sm text-muted-foreground">
            Every document you upload is chunked, embedded, and searchable from chat — grounded in
            your own words.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to="/upload">
            <Upload className="mr-2 h-4 w-4" /> Upload
          </Link>
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={total} isLoading={isLoading} />
        <Stat label="Indexed" value={ready} isLoading={isLoading} accent />
        <Stat label="Processing" value={processing} isLoading={isLoading} muted />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card/60">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Documents
          </p>
          {data && data.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {data.length} file{data.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {isLoading ? (
          <ul className="divide-y divide-border">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </li>
            ))}
          </ul>
        ) : !data || data.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <FileText className="h-6 w-6" />
            </div>
            <p className="mt-5 font-medium">No documents yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a note, markdown file, or PDF to start asking questions.
            </p>
            <Button asChild className="mt-5">
              <Link to="/upload">
                <Upload className="mr-2 h-4 w-4" /> Upload your first document
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((doc) => {
              const { Icon, label, tone } = fileMeta(doc.filename);
              const processing = doc.status === "processing";
              const isStuck =
                processing &&
                Date.now() - new Date(doc.created_at).getTime() > STUCK_AFTER_MS;
              const showIssue = doc.status === "failed" || isStuck;
              return (
                <li
                  key={doc.id}
                  className={`group px-5 py-4 transition-colors hover:bg-accent/30 ${
                    processing && !isStuck ? "animate-pulse-soft" : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{doc.filename}</p>
                        <span className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground sm:inline">
                          {label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })} ·{" "}
                        {formatBytes(doc.size_bytes)}
                        {doc.status === "ready" && ` · ${doc.chunk_count} chunks`}
                      </p>
                    </div>
                    <StatusBadge status={doc.status} isStuck={isStuck} />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(doc.id)}
                      aria-label="Delete"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {showIssue && (
                    <div className="ml-14 mt-2.5 flex items-start justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2">
                      <p className="min-w-0 flex-1 text-xs text-destructive">
                        {doc.status === "failed"
                          ? (doc.error ?? "This document failed to process.")
                          : "Still processing after 2+ minutes — this may have stalled."}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRetry(doc.id)}
                        className="h-7 shrink-0 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <RefreshCw className="h-3 w-3" /> Retry
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  isLoading,
  accent,
  muted,
}: {
  label: string;
  value: number;
  isLoading: boolean;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      {isLoading ? (
        <Skeleton className="mt-2 h-7 w-10" />
      ) : (
        <p
          className={`mt-1 text-2xl font-semibold tabular-nums ${
            accent ? "text-primary" : muted ? "text-muted-foreground" : ""
          }`}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status, isStuck }: { status: string; isStuck: boolean }) {
  if (status === "ready")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <CheckCircle2 className="h-3 w-3" /> Indexed
      </span>
    );
  if (status === "processing") {
    if (isStuck)
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" /> Processing
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Processing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
      <AlertCircle className="h-3 w-3" /> Failed
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
