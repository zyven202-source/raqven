// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { execSync } from "node:child_process";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * The release identity, injected into the bundle so a running page can say
 * which build it is. `scripts/write-build-info.mjs` computes exactly the same
 * string for `/version.json` after the build; if the two ever disagreed, every
 * phone would be told an update was waiting. Keep the two formulas identical.
 *
 * `+dirty` is deliberate: a rebuild of the same commit with local edits is a
 * different artifact and must not be mistaken for the deployed one.
 */
function gitValue(command: string, fallback: string): string {
  try {
    const out = execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return out.length > 0 ? out : fallback;
  } catch {
    return fallback;
  }
}

const releaseCommit = gitValue("git rev-parse --short HEAD", "unknown");
const releaseBuildId =
  gitValue("git status --porcelain", "") !== "" ? `${releaseCommit}+dirty` : releaseCommit;

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
    // The build id is read through `src/lib/build.ts`. An undefined value
    // there is handled: the app simply never claims an update is available.
    define: {
      __BUILD_ID__: JSON.stringify(releaseBuildId),
    },
    environments: {
      client: { build: { outDir: "dist" } },
    },
  },
});
