#!/usr/bin/env node
/**
 * Provisions a throwaway shop so the redesigned tabs can be looked at with real
 * rows in them, then leaves it for `--cleanup` to remove.
 *
 * Why a real account: every signed-in screen is behind RLS, and the only honest
 * way to see what it renders is to be a real member of a real shop. Nothing is
 * mocked, and nothing is added to anybody else's shop.
 *
 *   node scripts/verify-redesign-tabs.mjs            # provision, write /tmp/savo-redesign.json
 *   node scripts/verify-redesign-tabs.mjs --cleanup  # delete the shop and the user
 *
 * Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_ACCESS_TOKEN in
 * the environment (the workspace `.env` / `.env.local` already provide them).
 * Credentials are written to /tmp, never printed, so they cannot end up in a
 * transcript.
 */
import { readFileSync, writeFileSync } from "node:fs";

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const ACCESS = process.env.SUPABASE_ACCESS_TOKEN;
const STATE = "/tmp/savo-redesign.json";

if (!URL_BASE || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

const headers = { apikey: KEY, "Content-Type": "application/json" };

async function api(path, init = {}) {
  const response = await fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  }
  return body;
}

async function cleanup() {
  let state;
  try {
    state = JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    console.error("No provisioned state to clean up.");
    return;
  }
  if (state.shopId) {
    const sql = `delete from public.shops where id = '${state.shopId}';`;
    await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_ID}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
  }
  if (state.userId) {
    await fetch(
      `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_ID}/database/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ACCESS}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: `delete from auth.users where id = '${state.userId}';` }),
      },
    );
  }
  console.log("cleanup requested for shop", state.shopId, "and user", state.userId);
}

async function provision() {
  const stamp = Date.now();
  const email = `savo-redesign-${stamp}@example.com`;
  const password = `Redesign-${stamp}-savo`;

  const signup = await api("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const token = signup.access_token;
  const userId = signup.user?.id;
  if (!token || !userId) throw new Error("Sign-up returned no session; email confirmation may be on.");

  const auth = { Authorization: `Bearer ${token}`, Prefer: "return=representation" };

  const [shop] = await api("/rest/v1/shops", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      owner_id: userId,
      name: `Redesign QA ${stamp}`,
      slug: `redesign-qa-${stamp}`,
      currency: "USD",
      accepts_refunds: true,
    }),
  });

  const productRows = [
    { name: "Stoneware mug", buying_price: 4.5, selling_price: 12, quantity: 42, low_stock_threshold: 10, unit: "pc" },
    { name: "Linen tea towel", buying_price: 3, selling_price: 9, quantity: 7, low_stock_threshold: 10, unit: "pc" },
    { name: "Paper lantern", buying_price: 6.25, selling_price: 18, quantity: 0, low_stock_threshold: 4, unit: "pc" },
  ].map((row) => ({ ...row, shop_id: shop.id }));

  await api("/rest/v1/products", {
    method: "POST",
    headers: auth,
    body: JSON.stringify(productRows),
  });

  writeFileSync(STATE, JSON.stringify({ email, password, userId, shopId: shop.id }, null, 2), {
    mode: 0o600,
  });

  await api("/rest/v1/expenses", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      shop_id: shop.id,
      category: "packaging",
      description: "Packing paper for the counter",
      amount: 23.4,
      method: "cash",
      user_id: userId,
    }),
  });

  writeFileSync(STATE, JSON.stringify({ email, password, userId, shopId: shop.id }, null, 2), {
    mode: 0o600,
  });
  console.log("provisioned shop", shop.id, "with 3 products and 1 expense");
  console.log("credentials written to", STATE);
}

if (process.argv.includes("--cleanup")) await cleanup();
else await provision();
