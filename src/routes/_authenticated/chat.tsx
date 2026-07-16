import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createThread, deleteThread, listDocuments, listThreads } from "@/lib/rag.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, MessageSquare, Trash2, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatLayout,
});

function ChatLayout() {
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const del = useServerFn(deleteThread);
  const listDocs = useServerFn(listDocuments);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeId = pathname.startsWith("/chat/") ? pathname.split("/chat/")[1] : undefined;

  const { data: threads, isLoading } = useQuery({
    queryKey: ["threads"],
    queryFn: () => list(),
  });
  const { data: documents, isLoading: isLoadingDocs } = useQuery({
    queryKey: ["documents"],
    queryFn: () => listDocs(),
  });
  const hasDocuments = (documents?.length ?? 0) > 0;

  async function newChat() {
    try {
      const t = await create();
      await qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function onDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    try {
      await del({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["threads"] });
      if (activeId === id) navigate({ to: "/chat" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="flex min-h-0 flex-1">

      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card/30 md:flex">
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Conversations
          </p>
          <button
            onClick={newChat}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="New chat"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="px-3">
          <Button className="w-full justify-start gap-2" size="sm" onClick={newChat}>
            <Plus className="h-4 w-4" /> New chat
          </Button>
        </div>
        <div className="mt-3 flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
          {isLoading ? (
            <ul className="space-y-1 px-1">
              {[0, 1, 2].map((i) => (
                <li key={i} className="px-2 py-2">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                </li>
              ))}
            </ul>
          ) : !threads || threads.length === 0 ? (
            <div className="mx-2 mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center">
              <MessageSquare className="mx-auto h-4 w-4 text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">
                No conversations yet.
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => {
                const active = activeId === t.id;
                return (
                  <li key={t.id}>
                    <div
                      className={`group relative flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-all duration-150 ${
                        active
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      {active && (
                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
                      )}
                      <Link
                        to="/chat/$threadId"
                        params={{ threadId: t.id }}
                        className="flex min-w-0 flex-1 items-start gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm ${
                              active ? "font-medium" : ""
                            }`}
                          >
                            {t.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                          </p>
                        </div>
                      </Link>
                      <button
                        onClick={(e) => onDelete(t.id, e)}
                        className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1">
        {activeId ? (
          <Outlet />
        ) : (
          <EmptyChat
            onNewChat={newChat}
            hasDocuments={hasDocuments}
            isLoadingDocs={isLoadingDocs}
          />
        )}
      </div>
    </div>
  );
}

function EmptyChat({
  onNewChat,
  hasDocuments,
  isLoadingDocs,
}: {
  onNewChat: () => void;
  hasDocuments: boolean;
  isLoadingDocs: boolean;
}) {
  if (!isLoadingDocs && !hasDocuments) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center p-10 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card">
          <Upload className="h-6 w-6 text-primary" />
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-primary/10 to-transparent" />
        </div>
        <h2 className="mt-6 text-xl font-semibold tracking-tight">No documents yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Cortex answers questions by searching your uploaded notes — upload something first,
          then come back here to ask about it.
        </p>
        <Button asChild className="mt-6">
          <Link to="/upload">
            <Upload className="mr-2 h-4 w-4" /> Upload a document
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center p-10 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card">
        <MessageSquare className="h-6 w-6 text-primary" />
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-primary/10 to-transparent" />
      </div>
      <h2 className="mt-6 text-xl font-semibold tracking-tight">Ask your knowledge base</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Start a new conversation. Cortex will search your uploaded documents and cite the exact
        snippet each answer comes from.
      </p>
      <Button className="mt-6" onClick={onNewChat}>
        <Plus className="mr-2 h-4 w-4" /> New chat
      </Button>
    </div>
  );
}
