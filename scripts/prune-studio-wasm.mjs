/**
 * Keeps the Studio segmentation runtime out of the deployed artifact.
 *
 * `@imgly/background-removal` pulls in ONNX Runtime Web, and Vite emits the
 * threaded JSEP build of its runtime as a build asset: about 23 MB in one file.
 * SAVO does not serve that file. `src/lib/model-background.ts` points the
 * runtime at a pinned CDN copy before the first inference, because the only
 * visitors who need it are the ones opening Studio, and they fetch it once and
 * cache it.
 *
 * This runs at the end of `bun run build`, so every artifact — `dist/`, the
 * `site-public/` copy that gets uploaded, a local `vite preview`, or a build
 * someone runs by hand — is already free of it. Before, the exclusion was one
 * `find -delete` in one deploy command, which meant the next deploy that forgot
 * it would ship the file.
 *
 * It also fails the build when anything left behind is too large to upload, so a
 * new dependency cannot quietly reintroduce the same problem.
 */
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const OUT_DIR = resolve("dist");
/** Sites rejects a single asset above 10 MiB; stay under it with room to spare. */
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
/** The runtime's emitted names: ort-wasm-simd-threaded.jsep-<hash>.wasm, etc. */
const RUNTIME_ASSET = /^ort-wasm-.*\.(wasm|mjs)$/i;

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

let files;
try {
  files = walk(OUT_DIR);
} catch {
  console.error("[prune-studio-wasm] dist/ does not exist — run the build first.");
  process.exit(1);
}

const runtimeAssets = files.filter((path) => RUNTIME_ASSET.test(path.split(/[\\/]/).pop() ?? ""));
for (const path of runtimeAssets) unlinkSync(path);

const oversized = files
  .filter((path) => !runtimeAssets.includes(path))
  .map((path) => ({ path, bytes: statSync(path).size }))
  .filter((entry) => entry.bytes > MAX_ASSET_BYTES);

const leftovers = walk(OUT_DIR).filter((path) =>
  RUNTIME_ASSET.test(path.split(/[\\/]/).pop() ?? ""),
);

if (leftovers.length > 0) {
  console.error(
    `[prune-studio-wasm] ${leftovers.length} runtime file(s) survived removal — refusing this build.`,
  );
  process.exit(1);
}

if (oversized.length > 0) {
  for (const entry of oversized) {
    console.error(
      `[prune-studio-wasm] ${entry.path} is ${(entry.bytes / 1024 / 1024).toFixed(1)} MB, over the 10 MiB upload limit.`,
    );
  }
  console.error("[prune-studio-wasm] refusing to leave an undeployable artifact.");
  process.exit(1);
}

console.log(
  `[prune-studio-wasm] removed ${runtimeAssets.length} ONNX runtime file(s); no asset exceeds 10 MiB.`,
);
