// Removes the throwaway shops that the verification scripts create.
//
// `verify-business-engine.mjs`, `verify-staff-access.mjs` and
// `verify-ui-acceptance.mjs` each build a real shop with real rows, because
// that is the only honest way to test them. They delete their own users
// afterwards, but a shop outlives its user through the membership trigger, so
// runs accumulate: the shop list fills with "Duka 1790577371030" and friends,
// which is exactly the demo-data look this project is trying to avoid.
//
// This script removes shops whose names match the prefixes those scripts use.
// It refuses to touch anything else.
//
//   node scripts/cleanup-test-shops.mjs            # dry run, lists what it would delete
//   node scripts/cleanup-test-shops.mjs --delete   # actually delete
const DELETE = process.argv.includes("--delete");
// Shop names created by the verification scripts. Keep this list in step with
// the names those scripts insert.
const PATTERNS = [
  "Duka%", // business-engine.mjs, verify-ui-acceptance.mjs
  "Access Test Shop%", // verify-staff-access.mjs
  "Access Test Rival Shop%", // verify-staff-access.mjs (the cross-shop probe)
  "Other Shop", // verify-staff-access.mjs (the outsider's own shop)
  "Float %", // verify-float-bar.mjs
  "Glass %", // verify-glass-ui.mjs
  "Rail %", // the desktop-rail check
  "Contrast %", // verify-contrast.mjs
  "Closing %", // verify-shop-deletion.mjs
];

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ACCESS_TOKEN;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL and SUPABASE_ACCESS_TOKEN are required.");
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];

async function sql(query) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    },
  );
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 300));
  }
}

// The management API runs one statement with no bind parameters, so the
// patterns are literals from this file, not input.
const rows = await sql(
  `select id, name from public.shops
    where ${PATTERNS.map((p) => `name like '${p}'`).join(" or ")}
    order by created_at`,
);

if (!Array.isArray(rows) || rows.length === 0) {
  console.log("No test shops found.");
  process.exit(0);
}

console.log(`${rows.length} test shop(s) found:`);
for (const row of rows) console.log(`  ${row.name}  ${row.id}`);

if (!DELETE) {
  console.log("\nDry run. Re-run with --delete to remove them.");
  process.exit(0);
}

// Cascades are declared on the schema, so deleting the shop removes its
// products, sales, stock movements, debtors, expenses and access codes.
const ids = rows.map((row) => `'${row.id}'`).join(", ");
const result = await sql(`delete from public.shops where id in (${ids}) returning id`);
console.log(`\nDeleted ${Array.isArray(result) ? result.length : 0} shop(s).`);
