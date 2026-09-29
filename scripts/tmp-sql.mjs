// Throwaway read-only SQL helper for auditing the live database during
// development. It runs one statement through the Supabase management API and
// prints the result. It is never imported by the app and holds no credentials
// of its own — everything comes from the workspace environment.
//
//   node scripts/tmp-sql.mjs "select count(*) from shops"
const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;

if (!token || !url) {
  console.error("SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL are required.");
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];
const statement = process.argv[2];
if (!statement) {
  console.error('usage: node scripts/tmp-sql.mjs "<sql>"');
  process.exit(1);
}

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: statement }),
});

const text = await response.text();
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
