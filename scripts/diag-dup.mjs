// Diagnostic: find where the duplicated uuid lives and whether shop_members has dupes.
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.log("missing supabase env");
  process.exit(1);
}

const H = { apikey: key, Authorization: `Bearer ${key}` };
const get = async (path) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: H });
  const t = await r.text();
  try {
    return { status: r.status, json: JSON.parse(t) };
  } catch {
    return { status: r.status, text: t.slice(0, 300) };
  }
};

const ID = "251ba6ea-c5ef-4c71-aaa6-83d12f70bcf2";

for (const table of ["shops", "products", "activity_log", "debtor_payments", "expenses", "sales"]) {
  const r = await get(`${table}?id=eq.${ID}&select=id`);
  console.log(table, r.status, JSON.stringify(r.json ?? r.text).slice(0, 200));
}

// duplicate memberships
const dm = await get(`shop_members?select=shop_id,user_id,status&status=eq.active`);
if (Array.isArray(dm.json)) {
  const seen = new Map();
  for (const row of dm.json) {
    const k = `${row.shop_id}|${row.user_id}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, c]) => c > 1);
  console.log("active memberships:", dm.json.length, "duplicate pairs:", dups.length);
  for (const [k, c] of dups.slice(0, 10)) console.log("  DUP x" + c, k);
} else {
  console.log("shop_members error", dm.status, JSON.stringify(dm.json ?? dm.text).slice(0, 300));
}
