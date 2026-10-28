#!/usr/bin/env node
// Serve the production build in dist/ for verification suites.
//
// `vite preview` cannot serve this project: the build script deliberately
// deletes `dist/server`, which TanStack's preview plugin imports — so the
// only way to run a suite against the real production artefacts (as
// verify-pwa requires, registration being production-only) is a plain static
// file server with SPA fallback. Not a dev server: it serves built bytes
// exactly as hosting will.
//
// Usage: node scripts/serve-dist.mjs [port]   (default 4173)

import { join } from "node:path";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";

const ROOT = new URL("../dist", import.meta.url).pathname;
const PORT = Number(process.argv[2] || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2",
};

const typeOf = (path) => TYPES[path.slice(path.lastIndexOf("."))] ?? "application/octet-stream";

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = join(ROOT, pathname);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(ROOT, "index.html"); // SPA fallback
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": typeOf(file),
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`);
});
