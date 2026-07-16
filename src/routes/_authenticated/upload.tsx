import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, Loader2, CheckCircle2, AlertCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ingestDocument } from "@/lib/rag.functions";
import { extractFileText } from "@/lib/pdf";
import { fileMeta } from "@/lib/file-icon";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
});

type FileStatus = {
  file: File;
  status: "pending" | "parsing" | "uploading" | "done" | "error";
  message?: string;
};

function UploadPage() {
  const ingest = useServerFn(ingestDocument);
  const navigate = useNavigate();
  const [items, setItems] = useState<FileStatus[]>([]);
  const [processing, setProcessing] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    setItems((prev) => [
      ...prev,
      ...accepted.map((f) => ({ file: f, status: "pending" as const })),
    ]);
  }, []);

  const MAX_SIZE = 20 * 1024 * 1024;

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".txt"],
      "text/markdown": [".md", ".markdown"],
      "application/pdf": [".pdf"],
    },
    maxSize: MAX_SIZE,
  });

  async function processOne(idx: number) {
    const f = items[idx].file;
    try {
      setItems((prev) =>
        prev.map((it, i) => (i === idx ? { ...it, status: "parsing", message: undefined } : it)),
      );
      const text = await extractFileText(f);
      if (!text.trim()) throw new Error("No text extracted from file");

      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, status: "uploading" } : it)));
      await ingest({
        data: {
          filename: f.name,
          mimeType: f.type || "application/octet-stream",
          sizeBytes: f.size,
          text,
        },
      });
      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, status: "done" } : it)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setItems((prev) =>
        prev.map((it, i) => (i === idx ? { ...it, status: "error", message: msg } : it)),
      );
      toast.error(`${f.name}: ${msg}`);
    }
  }

  async function processAll() {
    setProcessing(true);
    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== "pending") continue;
      await processOne(i);
    }
    setProcessing(false);
    if (items.length > 0) toast.success("Upload complete");
  }

  async function retryItem(idx: number) {
    setProcessing(true);
    await processOne(idx);
    setProcessing(false);
  }

  const pending = items.filter((i) => i.status === "pending").length;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-8 overflow-y-auto p-6 md:p-10">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Ingest
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Upload documents</h1>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Drop .txt, .md, or .pdf files. Each is parsed, chunked, and embedded into your private
          knowledge base.
        </p>
      </header>

      <div
        {...getRootProps()}
        className={`group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-14 text-center transition-all duration-200 ${
          isDragActive
            ? "scale-[1.01] border-primary bg-primary/5"
            : "border-border bg-card/40 hover:border-primary/40 hover:bg-accent/20"
        }`}
      >
        <input {...getInputProps()} />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform group-hover:scale-105">
          <UploadCloud className="h-6 w-6" />
        </div>
        <p className="mt-5 text-base font-medium">
          {isDragActive ? "Drop them here" : "Drag files here or click to browse"}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className="rounded border border-border px-1.5 py-0.5 font-mono">.txt</span>{" "}
          <span className="rounded border border-border px-1.5 py-0.5 font-mono">.md</span>{" "}
          <span className="rounded border border-border px-1.5 py-0.5 font-mono">.pdf</span>{" "}
          <span className="ml-2 text-muted-foreground/70">up to 20 MB each</span>
        </p>
      </div>

      {fileRejections.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
          {fileRejections.map(({ file, errors }, i) => {
            const tooBig = errors.some((e) => e.code === "file-too-large");
            const message = tooBig
              ? `${file.name} (${formatBytes(file.size)}) is too large — the limit is ${formatBytes(MAX_SIZE)}.`
              : errors.some((e) => e.code === "file-invalid-type")
                ? `${file.name} isn't a supported file type — only .txt, .md, and .pdf are accepted.`
                : `${file.name}: ${errors[0]?.message ?? "couldn't be added"}.`;
            return (
              <p key={i} className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {message}
              </p>
            );
          })}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {items.length} file{items.length === 1 ? "" : "s"} queued
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={processing}
                onClick={() => setItems([])}
              >
                Clear
              </Button>
              <Button size="sm" disabled={processing || pending === 0} onClick={processAll}>
                {processing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing
                  </>
                ) : (
                  `Process ${pending} file${pending === 1 ? "" : "s"}`
                )}
              </Button>
            </div>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/60">
            {items.map((it, idx) => {
              const { Icon, tone } = fileMeta(it.file.name);
              return (
                <li key={idx} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.file.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatBytes(it.file.size)}
                    </p>
                    {it.message && (
                      <p className="mt-0.5 truncate text-xs text-destructive">{it.message}</p>
                    )}
                  </div>
                  <StatusPill status={it.status} />
                  {it.status === "error" && !processing && (
                    <button
                      onClick={() => retryItem(idx)}
                      className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                      aria-label={`Retry ${it.file.name}`}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Retry
                    </button>
                  )}
                  {(it.status === "pending" || it.status === "error") && !processing && (
                    <button
                      onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {items.every((i) => i.status === "done" || i.status === "error") &&
            !processing && (
              <div className="flex justify-end">
                <Button onClick={() => navigate({ to: "/dashboard" })}>
                  View knowledge base
                </Button>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: FileStatus["status"] }) {
  if (status === "done")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        <CheckCircle2 className="h-3 w-3" /> Done
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <AlertCircle className="h-3 w-3" /> Failed
      </span>
    );
  if (status === "pending")
    return (
      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
        Queued
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      {status === "parsing" ? "Parsing" : "Embedding"}
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
