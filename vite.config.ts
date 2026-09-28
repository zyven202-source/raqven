// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // Client-side SPA: prerender the app shell so the static host can serve it
    // for every route, including deep links such as /dashboard and /app/pos.
    spa: { enabled: true, prerender: { outputPath: "/index" } },
  },
  // Freebuff hosting publishes this project as a static Vite site: it runs the
  // build, then copies `dist/*` to the deploy artifact. So the client build must
  // land directly in `dist/` (index.html + assets) and no nitro server bundle is
  // emitted. All data access already happens in the browser against Supabase, so
  // nothing depends on a Node server at runtime.
  nitro: false,
  vite: {
    environments: {
      client: { build: { outDir: "dist" } },
    },
  },
});
