import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Upload, MessageSquare, Plug, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BrandLockup, BrandMark } from "@/components/BrandMark";
import type { ReactNode } from "react";

const nav = [
  { to: "/dashboard", label: "Docs", longLabel: "Documents", icon: LayoutGrid, hint: "⌘1" },
  { to: "/upload", label: "Upload", longLabel: "Upload", icon: Upload, hint: "⌘2" },
  { to: "/chat", label: "Chat", longLabel: "Chat", icon: MessageSquare, hint: "⌘3" },
  { to: "/connect", label: "Connect", longLabel: "Connect AI", icon: Plug, hint: "⌘4" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-[100dvh] bg-background md:min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
        <Link
          to="/dashboard"
          className="mb-6 rounded-lg px-2 py-1.5 transition-colors hover:bg-sidebar-accent/60"
        >
          <BrandLockup />
        </Link>

        <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Workspace
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {nav.map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-150 ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                {active && (
                  <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
                )}
                <n.icon
                  className={`h-4 w-4 transition-colors ${
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  }`}
                />
                <span className="flex-1">{n.longLabel}</span>
                <span className="font-mono text-[10px] text-muted-foreground/60">{n.hint}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 border-t border-sidebar-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-foreground/75 hover:text-sidebar-foreground"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Right column */}
      <div className="flex min-w-0 flex-1 flex-col h-[100dvh] md:h-screen overflow-hidden">
        {/* Mobile top header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
          <Link to="/dashboard" className="flex items-center gap-2">
            <BrandMark className="h-5 w-5 text-primary" />
            <span className="text-base font-semibold tracking-tight">Cortex</span>
          </Link>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        {/* Main content */}
        <main className="flex min-h-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          aria-label="Primary"
        >
          {nav.map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" />
                )}
                <n.icon className="h-5 w-5" />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
