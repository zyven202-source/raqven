#!/usr/bin/env node
/**
 * End-to-end verification of the RAVQEN auth + RLS foundation against the
 * linked Supabase project, using only the public API (the same path the app
 * uses) plus one privileged cleanup call at the end.
 *
 * Checks:
 *   1. Sign-up returns a live session       -> email confirmation is off
 *   2. profiles row exists for the new user -> handle_new_user trigger works
 *   3. Password login returns a session
 *   4. The brand-new account sees no shops / members -> RLS is deny-by-default
 *   5. Throwaway user is deleted via the management API
 *
 * Usage: bun scripts/verify-auth-flow.mjs
 * Requires in the environment: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
 * SUPABASE_ACCESS_TOKEN (workspace .env / .env.local already provide them).
 */

const URL_BASE = process.env.SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!URL_BASE || !PUBLISHABLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in the environment.");
  process.exit(1);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const stamp = Date.now();
const email = `ravqen-verify-${stamp}@example.com`;
const password = `Verify-${stamp}-ravqen`;

const authHeaders = { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" };

async function signup() {
  const response = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      email,
      password,
      data: { full_name: "Verify User", phone: null },
    }),
  });
  return { ok: response.ok, status: response.status, body: await response.json() };
}

async function login() {
  const response = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ email, password }),
  });
  return { ok: response.ok, status: response.status, body: await response.json() };
}

async function readRows(path, accessToken) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  return { ok: response.ok, status: response.status, rows: await response.json() };
}

async function deleteUser(userId) {
  if (!ACCESS_TOKEN) return { ok: false, reason: "no SUPABASE_ACCESS_TOKEN" };
  const projectRef = new URL(URL_BASE).hostname.split(".")[0];
  const keysResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!keysResponse.ok) return { ok: false, reason: `api-keys ${keysResponse.status}` };
  const keys = await keysResponse.json();
  const serviceKey = keys.find((k) => k.name === "service_role")?.api_key;
  if (!serviceKey) return { ok: false, reason: "no service_role key" };

  const response = await fetch(`${URL_BASE}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  return { ok: response.ok, reason: `status ${response.status}` };
}

// 1) sign up
const signupResult = await signup();
const session = signupResult.body?.access_token;
const userId = signupResult.body?.user?.id;
check(
  "signup returns a live session (email confirmation off)",
  signupResult.ok && Boolean(session),
  `status ${signupResult.status}${signupResult.ok ? "" : ` ${JSON.stringify(signupResult.body)}`}`,
);

if (!session || !userId) {
  console.log("\nCannot continue without a session.");
  process.exit(1);
}

// 2) profile row created by trigger, readable by its owner
const profile = await readRows(`profiles?select=id,full_name&id=eq.${userId}`, session);
const profileRow = Array.isArray(profile.rows) ? profile.rows[0] : null;
check(
  "profile row created on signup",
  Boolean(profileRow) && profileRow.full_name === "Verify User",
  profileRow ? `full_name="${profileRow.full_name}"` : JSON.stringify(profile.rows),
);

// 3) password login
const loginResult = await login();
check(
  "password login returns a session",
  loginResult.ok && Boolean(loginResult.body?.access_token),
  `status ${loginResult.status}`,
);

// 4) RLS: a brand-new account belongs to no shop and sees nothing
const shops = await readRows("shops?select=id", session);
const members = await readRows("shop_members?select=id", session);
const products = await readRows("products?select=id", session);
const emptyForNewUser =
  Array.isArray(shops.rows) &&
  shops.rows.length === 0 &&
  Array.isArray(members.rows) &&
  members.rows.length === 0 &&
  Array.isArray(products.rows) &&
  products.rows.length === 0;
check(
  "RLS blocks shops/members/products for an unaffiliated account",
  emptyForNewUser,
  `shops=${shops.rows?.length ?? "?"} members=${members.rows?.length ?? "?"} products=${products.rows?.length ?? "?"}`,
);

// 5) wrong password must be rejected
const badLogin = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ email, password: `${password}-wrong` }),
});
check("wrong password is rejected", badLogin.status >= 400, `status ${badLogin.status}`);

// 6) cleanup
const cleanup = await deleteUser(userId);
check("throwaway user deleted", cleanup.ok, cleanup.reason ?? "");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
