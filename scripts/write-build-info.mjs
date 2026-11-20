/**
 * Publishes `/version.json` for the release that was just built.
 *
 * The file is the server's half of the build-identity pair: the running bundle
 * carries the same id (injected by `vite.config.ts` as `__BUILD_ID__`), and the
 * app compares the two to notice that a newer deployment is live. The
 * service worker reads the same file to namespace its caches per release, so a
 * cached shell from an earlier build can never be mistaken for this one.
 *
 * It runs last in `bun run build`, after the prerender pass, so the version
 * describes the finished artifact rather than an intermediate directory.
 *
 * The id is the short commit SHA, and `+dirty` when the working tree had
 * uncommitted changes. That suffix matters: two builds of the same commit with
 * different local edits are different artifacts, and without it the second one
 * would look identical to the first and never reach the phones that already
 * had it.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function git(command, fallback) {
  try {
    const out = execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return out.length > 0 ? out : fallback;
  } catch {
    return fallback;
  }
}

const commit = git("git rev-parse --short HEAD", "unknown");
const dirty = git("git status --porcelain", "") !== "";
const buildId = dirty ? `${commit}+dirty` : commit;

const outDir = resolve("dist");
mkdirSync(outDir, { recursive: true });

const info = { buildId, commit, builtAt: new Date().toISOString() };
writeFileSync(resolve(outDir, "version.json"), `${JSON.stringify(info, null, 2)}\n`);

console.log(`version.json: ${buildId} (${info.builtAt})`);
