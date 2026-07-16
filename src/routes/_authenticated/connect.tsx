import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, Copy, ExternalLink, Loader2, PlugZap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/connect")({
  component: ConnectPage,
});

type TestState = "idle" | "loading" | "success" | "error";

function ConnectPage() {
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    setMcpUrl(new URL("/mcp", window.location.origin).toString());
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function testConnection() {
    setTestState("loading");
    setTestError(null);
    setTestResult(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const res = await fetch("/.mcp/invoke-tool/search_documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: "test" }),
      });

      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 300)}`);
      }
      setTestResult(JSON.stringify(json, null, 2));

      if (!res.ok) {
        const message =
          json && typeof json === "object" && "error" in json
            ? String((json as { error: unknown }).error)
            : `Request failed (${res.status})`;
        setTestError(message);
        setTestState("error");
        return;
      }
      if (json && typeof json === "object" && (json as { isError?: boolean }).isError) {
        setTestError("The tool reported an error — see the raw result below.");
        setTestState("error");
        return;
      }
      setTestState("success");
    } catch (e) {
      setTestState("error");
      setTestError(e instanceof Error ? e.message : "Test failed");
    }
  }

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 py-10">
        <header className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Agent integrations
          </p>
          <h1 className="mt-1 max-w-full break-words text-2xl font-semibold tracking-tight">
            Connect Cortex to your AI assistant
          </h1>
          <p className="mt-2 max-w-xl break-words text-sm text-muted-foreground">
            Query your uploaded documents from ChatGPT, Claude, or any MCP-compatible
            client. Sign in once with your Cortex account — your assistant then acts
            as you and only sees your own notes.
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            MCP server URL
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
              {mcpUrl || "Loading…"}
            </code>
            <Button variant="outline" size="sm" onClick={copy} disabled={!mcpUrl}>
              {copied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                </>
              )}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Paste this URL into your assistant's connector setup. You'll be sent
            back here to sign in and approve the connection.
          </p>

          <div className="mt-4 border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={testState === "loading"}
            >
              {testState === "loading" ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Testing…
                </>
              ) : (
                <>
                  <PlugZap className="mr-1.5 h-3.5 w-3.5" /> Test Connection
                </>
              )}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Calls <code className="rounded border border-border px-1 py-0.5 font-mono text-[11px]">search_documents</code> with
              a sample query ("test") to confirm the connector is wired up correctly.
            </p>

            {testError && (
              <p className="mt-3 text-xs text-destructive">{testError}</p>
            )}
            {testResult && (
              <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                <code>{testResult}</code>
              </pre>
            )}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Connect from ChatGPT</h2>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">1.</span> Open{" "}
              <a
                href="https://chatgpt.com/#settings/Connectors/Advanced"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                ChatGPT → Settings → Connectors → Advanced
                <ExternalLink className="ml-1 inline-block h-3 w-3 align-[-2px]" />
              </a>{" "}
              and enable <strong className="text-foreground">Developer mode</strong>{" "}
              (read the risk notice shown there).
            </li>
            <li>
              <span className="text-foreground">2.</span> In the chat composer's{" "}
              <strong className="text-foreground">+</strong> menu, turn on Developer mode.
            </li>
            <li>
              <span className="text-foreground">3.</span> Click{" "}
              <strong className="text-foreground">Add sources</strong>, then{" "}
              <strong className="text-foreground">Connect more</strong>.
            </li>
            <li>
              <span className="text-foreground">4.</span> Name the connector (e.g.
              "Cortex") and paste the MCP URL above.
            </li>
            <li>
              <span className="text-foreground">5.</span> Ask ChatGPT to search your
              documents — for example, <em>"Use Cortex to summarize my meeting notes."</em>
            </li>
          </ol>
        </section>

        <section className="mb-8 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Connect from Claude</h2>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">1.</span> Open{" "}
              <a
                href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Claude → Custom connectors
                <ExternalLink className="ml-1 inline-block h-3 w-3 align-[-2px]" />
              </a>
              .
            </li>
            <li>
              <span className="text-foreground">2.</span> Name the connector (e.g.
              "Cortex") and paste the MCP URL above.
            </li>
            <li>
              <span className="text-foreground">3.</span> Enable the connector from
              the chat composer, then ask Claude a question grounded in your notes.
            </li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            For <strong className="text-foreground">Claude Desktop</strong> or{" "}
            <strong className="text-foreground">Claude Code</strong>, add a custom
            HTTP MCP server pointing at the same URL — Claude will open your browser
            to sign in and approve access.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">What your assistant can do</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">search_documents</strong> —
              semantic search over your uploaded notes, returning the most relevant
              snippets with filenames.
            </li>
            <li>
              <strong className="text-foreground">ask_knowledge_base</strong> — a
              full grounded answer synthesized from your documents, with a general-
              knowledge fallback when your notes don't cover the question.
            </li>
          </ul>
        </section>
      </div>
  );
}
