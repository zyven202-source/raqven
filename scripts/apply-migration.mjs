/**
 * Applies a migration to the linked Supabase project through the Management API
 * and records it in supabase_migrations.schema_migrations so `supabase db push`
 * stays consistent with what is actually in the database.
 *
 * Usage: node scripts/apply-migration.mjs <file.sql>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
// Derive the ref from the project URL: SUPABASE_PROJECT_ID is not reliably set
// to the linked project, and a wrong ref fails with a confusing scope error.
const projectRef = new URL(
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL,
).hostname.split(".")[0];

if (!token || !projectRef) {
  console.error("SUPABASE_ACCESS_TOKEN / VITE_SUPABASE_URL is not set.");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <file.sql>");
  process.exit(1);
}

const sql = readFileSync(resolve(file), "utf8");
const version = /^(\d{14})_/.exec(file.split("/").pop())?.[1];

async function query(sqlText) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sqlText }),
    },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return text;
}

try {
  await query(sql);
  console.log(`applied ${file}`);
} catch (error) {
  console.error(`FAILED ${file}\n${error.message}`);
  process.exit(1);
}

if (version) {
  try {
    await query(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ('${version}', '${file
         .split("/")
         .pop()
         .replace(/\.sql$/, "")}')
       on conflict (version) do nothing;`,
    );
    console.log(`recorded migration ${version}`);
  } catch (error) {
    console.error(`migration applied but version not recorded: ${error.message}`);
    process.exit(1);
  }
}
