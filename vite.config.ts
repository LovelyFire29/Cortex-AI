// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// @lovable.dev/mcp-js's configResolved hook compares Vite's `config.root`
// (always forward-slash, per Vite convention) against paths built with
// `path.resolve()` (native separators — backslashes on Windows), so its
// internal `assertContains` check fails on Windows even though the paths
// point to the same directory. There's no plugin option to control this, so
// normalize `root` to native separators before the plugin sees it.
function fixWindowsRoutesDir(plugin: Plugin): Plugin {
  if (process.platform !== "win32" || typeof plugin.configResolved !== "function") {
    return plugin;
  }
  const original = plugin.configResolved;
  plugin.configResolved = function (config, ...rest) {
    const patched = { ...config, root: path.win32.normalize(config.root) };
    return (original as (...args: unknown[]) => unknown).call(this, patched, ...rest);
  };
  return plugin;
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [fixWindowsRoutesDir(mcpPlugin())],
  },
  // Hard-pin the Nitro preset to Vercel rather than relying on auto-detection —
  // the package default falls back to cloudflare-module outside a Lovable build.
  nitro: { preset: "vercel" },
});
