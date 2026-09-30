// Copies the workspace's Supabase audit credentials into /tmp/qa-env.json so
// the out-of-repo browser suites (/tmp/pwtest) can clean up after themselves.
// Read-only over the workspace environment — the same pattern tmp-sql.mjs and
// the verify-*.mjs scripts use — and it never prints a value. Delete the file
// when the QA run is done.
import { writeFileSync } from "node:fs";

const access = process.env.SUPABASE_ACCESS_TOKEN ?? null;
const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null;

if (!access || !url) {
  console.error("qa-env: workspace credentials are not set; cleanup will be skipped.");
  process.exit(1);
}

writeFileSync("/tmp/qa-env.json", JSON.stringify({ access, url }), { mode: 0o600 });
console.log("qa-env: wrote /tmp/qa-env.json");
