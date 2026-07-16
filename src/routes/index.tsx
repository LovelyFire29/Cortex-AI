import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, MessageSquare, Upload, ArrowRight, Github, Linkedin, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-primary)_30%,transparent),transparent_70%),linear-gradient(to_bottom,transparent_0%,transparent_35%,color-mix(in_oklab,var(--color-primary)_5%,transparent)_65%,color-mix(in_oklab,var(--color-primary)_11%,transparent)_100%)]" />

      <header className="relative border-b border-border/50 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/20">
              <BrandMark className="h-[18px] w-[18px]" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-tight">Cortex</span>
              <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Knowledge base
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Sign up</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 pt-24 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Private RAG over your own notes
        </div>
        <h1 className="mt-8 text-5xl font-semibold tracking-tight sm:text-7xl">
          Your personal
          <br />
          <span className="bg-gradient-to-r from-primary to-[oklch(0.78_0.14_240)] bg-clip-text text-transparent">
            AI memory
          </span>
          .
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Upload your notes and documents. Ask anything. Every answer is grounded in your own
          words — with the exact source snippet cited underneath.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">
              Start for free <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/dashboard">Open app</Link>
          </Button>
        </div>

        <div className="mt-28 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Upload,
              title: "Drop it in",
              body: "Upload PDFs, notes, or markdown in seconds.",
            },
            {
              icon: MessageSquare,
              title: "Ask naturally",
              body: "Ask questions like you're talking to a person.",
            },
            {
              icon: FileText,
              title: "See the source",
              body: "Every answer links back to the exact passage it came from.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border/40 bg-card/50 p-6 text-left shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/70 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform group-hover:scale-105">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      <section className="relative border-t border-border/50">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <div className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-6">
            {[
              {
                step: "1",
                title: "Upload",
                body: "Add your PDFs, notes, or markdown files to your private knowledge base.",
              },
              {
                step: "2",
                title: "Ask",
                body: "Ask questions in plain language, just like chatting with a person.",
              },
              {
                step: "3",
                title: "Get grounded answers",
                body: "Receive answers cited back to the exact passage they came from.",
              },
            ].map((s) => (
              <div key={s.step} className="relative text-center sm:text-left">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/20 sm:mx-0">
                  {s.step}
                </div>
                <div className="absolute left-9 top-[18px] hidden h-px w-[calc(100%-0.75rem)] bg-border/50 last:hidden sm:block" />
                <h3 className="mt-4 font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative border-t border-border/50">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
            <div>
              <p className="text-xs text-muted-foreground">
                © 2026 Srinivasa Raghavan S. All rights reserved.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Built with TypeScript, React, TanStack Start, Supabase
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[
                { icon: Linkedin, href: "https://linkedin.com/in/srinivasaraghavan29", label: "LinkedIn" },
                { icon: Github, href: "https://github.com/LovelyFire29", label: "GitHub" },
                { icon: Mail, href: "mailto:ssrinivasaraghavan29@gmail.com", label: "Email" },
              ].map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("mailto:") ? undefined : "_blank"}
                  rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
                  aria-label={label}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card/40 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
