/**
 * SAVO owner shop-deletion verification.
 *
 * Deleting a shop is the only thing in this product that destroys accounting
 * records, so it is the only operation verified from both sides: the guards are
 * driven from a real signed-in client the way a compromised or careless one
 * would, and the result is inspected with project-owner SQL so nothing is taken
 * on trust from the database it is testing.
 *
 * What it proves:
 *
 *   an employee cannot delete the shop they work in
 *   a stranger cannot delete someone else's shop, even naming it exactly
 *   an anonymous caller cannot call the deletion at all
 *   the owner cannot delete by pressing a button — the name has to be typed
 *   the preview reports the rows that are really there
 *   the owner's account survives, so they can open another shop
 *   a staff member loses access but keeps their account
 *   every child row is gone afterwards: sales, lines, payments, refunds,
 *     refund lines, debtors, debtor payments, products, stock movements,
 *     memberships and the activity log
 *   a tombstone survives the cascade, holding the name and the counts
 *
 * Every shop it creates is named "Closing …" and is matched by
 * `scripts/cleanup-test-shops.mjs`.
 *
 * Requires SUPABASE_ACCESS_TOKEN for the SQL assertions; without it the guard
 * checks still run and the after-state checks report as skipped rather than
 * silently passing.
 *
 * Run: node scripts/verify-shop-deletion.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
const KEY = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT = new URL(SUPABASE_URL).hostname.split(".")[0];

if (!SUPABASE_URL || !KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

const stamp = Date.now();
const ownerEmail = `savo-closing-owner-${stamp}@example.com`;
const staffEmail = `savo-closing-staff-${stamp}@example.com`;
const strangerEmail = `savo-closing-stranger-${stamp}@example.com`;
const password = "Closing-Test-Passw0rd!";
const SHOP_NAME = `Closing Shop ${stamp}`;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fails(name, promise, expect) {
  return promise.then(
    ({ error }) => {
      const message = error?.message ?? "";
      check(name, Boolean(error) && message.includes(expect), message || "expected an error");
    },
    (thrown) => {
      check(name, true, thrown?.message ?? String(thrown));
    },
  );
}

/** Runs SQL as the project owner. For assertions only — never for setup. */
async function sql(query) {
  if (!TOKEN) return null;
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function signUp(email) {
  const client = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`signup ${email}: ${error.message}`);
  if (!data.session) {
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw new Error(`signin ${email}: ${signedIn.error.message}`);
  }
  return client;
}

try {
  const owner = await signUp(ownerEmail);
  const staff = await signUp(staffEmail);
  const stranger = await signUp(strangerEmail);
  const ownerId = (await owner.auth.getUser()).data.user.id;
  const staffId = (await staff.auth.getUser()).data.user.id;

  // The owner opens a shop and trades in it, so the deletion has something real
  // to destroy. The rows are created through the product's own RPCs rather than
  // by hand, so the cascade is tested against the shape the app actually writes.
  const { data: shop, error: shopError } = await owner
    .from("shops")
    .insert({ owner_id: ownerId, name: SHOP_NAME, slug: `closing-${stamp}` })
    .select()
    .single();
  if (shopError) throw shopError;

  const { data: product, error: productError } = await owner
    .from("products")
    .insert({ shop_id: shop.id, name: "Closing Sugar", quantity: 50 })
    .select()
    .single();
  if (productError) throw productError;

  const { error: saleError } = await owner.rpc("create_sale", {
    p_shop_id: shop.id,
    p_items: [{ product_id: product.id, quantity: 2, unit_price: 425, discount_amount: 0 }],
    p_payment_method: "credit",
    p_debtor_name: "Closing Debtor",
    p_debtor_phone: "0700000000",
  });
  if (saleError) throw saleError;

  // The staff member joins through the ordinary door, so their membership is a
  // real one and losing it is the real thing.
  const { error: joinError } = await owner
    .from("shop_members")
    .insert({ shop_id: shop.id, user_id: staffId, role: "employee", status: "active" });
  if (joinError) throw joinError;

  // ------------------------------------------------------- 1. an employee
  await fails(
    "an employee cannot delete the shop they work in",
    staff.rpc("delete_shop", { p_shop_id: shop.id, p_confirm_shop_name: SHOP_NAME }),
    "Only the owner",
  );
  await fails(
    "an employee cannot even count what deleting it would destroy",
    staff.rpc("shop_deletion_preview", { p_shop_id: shop.id }),
    "Only the owner",
  );

  // --------------------------------------------------------- 2. a stranger
  await fails(
    "a stranger cannot delete another shop, naming it exactly",
    stranger.rpc("delete_shop", { p_shop_id: shop.id, p_confirm_shop_name: SHOP_NAME }),
    "Only the owner",
  );

  // ------------------------------------------------------ 3. not signed in
  const anon = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await fails(
    "an anonymous caller cannot call the deletion at all",
    anon.rpc("delete_shop", { p_shop_id: shop.id, p_confirm_shop_name: SHOP_NAME }),
    "permission denied",
  );

  // --------------------------------------------- 4. the owner, but no typing
  await fails(
    "the owner cannot delete without typing the shop's name",
    owner.rpc("delete_shop", { p_shop_id: shop.id, p_confirm_shop_name: "yes please" }),
    "Type the shop name exactly",
  );
  await fails(
    "a nearly-right name is still refused",
    owner.rpc("delete_shop", { p_shop_id: shop.id, p_confirm_shop_name: SHOP_NAME.slice(0, -1) }),
    "Type the shop name exactly",
  );
  await fails(
    "an empty confirmation is refused",
    owner.rpc("delete_shop", { p_shop_id: shop.id, p_confirm_shop_name: "   " }),
    "Type the shop name exactly",
  );

  // The shop is still there after six refusals, which is the point of them.
  {
    const { data: still } = await owner.from("shops").select("id").eq("id", shop.id).maybeSingle();
    check(
      "every refused attempt left the shop untouched",
      Boolean(still),
      still ? "still present" : "gone",
    );
  }

  // ---------------------------------------------------------- 5. the preview
  const { data: preview, error: previewError } = await owner.rpc("shop_deletion_preview", {
    p_shop_id: shop.id,
  });
  check(
    "the owner gets a preview naming the shop and counting its records",
    !previewError && preview?.shop_name === SHOP_NAME && preview?.counts?.sales === 1,
    previewError?.message ?? JSON.stringify(preview?.counts),
  );
  check(
    "the preview counts the staff membership it will cost them",
    preview?.counts?.staff === 2,
    `staff: ${preview?.counts?.staff}`,
  );
  await fails(
    "…and it is refused for a shop id that does not exist",
    owner.rpc("shop_deletion_preview", { p_shop_id: "00000000-0000-0000-0000-000000000000" }),
    "does not exist",
  );

  // ---------------------------------------------------------- 6. the delete
  const { data: deleted, error: deleteError } = await owner.rpc("delete_shop", {
    p_shop_id: shop.id,
    // Padded and lower-cased on purpose: a shopkeeper typing on a phone keyboard
    // should not lose their shop to a trailing space, and the comparison has to
    // agree with what the screen promises.
    p_confirm_shop_name: `  ${SHOP_NAME.toLowerCase()}  `,
  });
  check(
    "the owner can delete their own shop by typing its name",
    !deleteError && deleted?.deleted === true && deleted?.shop_name === SHOP_NAME,
    deleteError?.message ?? JSON.stringify(deleted?.counts),
  );

  // --------------------------------------------------------- 7. the aftermath
  {
    const { data: rows } = await owner.from("shops").select("id").eq("id", shop.id).maybeSingle();
    check("the shop is gone", !rows);
  }

  // The owner's account is not touched — `shops.owner_id` is ON DELETE RESTRICT
  // and nothing here deletes from auth.users, which is what lets them open
  // another shop instead of being signed out into an empty account.
  {
    const stillSignedIn = await owner.auth.getUser();
    check("the owner stays signed in", !stillSignedIn.error && Boolean(stillSignedIn.data?.user));
    const { data: fresh, error: freshError } = await owner
      .from("shops")
      .insert({
        owner_id: ownerId,
        name: `Closing Shop ${stamp} reopened`,
        slug: `closing-again-${stamp}`,
      })
      .select()
      .single();
    check(
      "…and can immediately open another shop",
      !freshError && Boolean(fresh),
      freshError?.message ?? "",
    );
  }

  // The staff member loses the membership but keeps their own account.
  {
    const { data: theirShops } = await staff.from("shops").select("id");
    check("the staff member no longer has this shop", !theirShops?.some((s) => s.id === shop.id));
    const stillSignedIn = await staff.auth.getUser();
    check("…but their account is untouched", Boolean(stillSignedIn.data?.user));
  }

  // ---------------------------------------------------------- 8. the cascade
  const orphans = TOKEN
    ? await sql(`
        select
          (select count(*) from public.sale_items        where shop_id = '${shop.id}') as sale_items,
          (select count(*) from public.payments           where shop_id = '${shop.id}') as payments,
          (select count(*) from public.refunds            where shop_id = '${shop.id}') as refunds,
          (select count(*) from public.refund_items       where shop_id = '${shop.id}') as refund_items,
          (select count(*) from public.debtors            where shop_id = '${shop.id}') as debtors,
          (select count(*) from public.debtor_payments    where shop_id = '${shop.id}') as debtor_payments,
          (select count(*) from public.products           where shop_id = '${shop.id}') as products,
          (select count(*) from public.inventory_movements where shop_id = '${shop.id}') as movements,
          (select count(*) from public.shop_members       where shop_id = '${shop.id}') as members,
          (select count(*) from public.audit_log          where shop_id = '${shop.id}') as audit,
          (select count(*) from public.sales              where shop_id = '${shop.id}') as sales
      `)
    : null;
  if (orphans?.[0]) {
    const row = orphans[0];
    const strays = Object.entries(row).filter(([, n]) => Number(n) > 0);
    check(
      "every child row went with it — nothing orphaned anywhere",
      strays.length === 0,
      strays.length === 0
        ? "sales, lines, payments, refunds, refund lines, debtors, debtor payments, products, stock, members, audit: all zero"
        : strays.map(([k, v]) => `${k}=${v}`).join(", "),
    );
  } else {
    console.log("SKIP  the cascade checks need SUPABASE_ACCESS_TOKEN");
    results.push({ name: "the cascade checks ran", ok: false });
  }

  // -------------------------------------------------------- 9. the tombstone
  const tombstones = TOKEN
    ? await sql(
        `select shop_name, member_count, counts->>'sales' as sales, counts->>'debtors' as debtors
           from public.shop_deletions where shop_id = '${shop.id}'`,
      )
    : null;
  check(
    "a record of the deletion survives the cascade",
    Boolean(tombstones?.[0]) &&
      tombstones[0].shop_name === SHOP_NAME &&
      Number(tombstones[0].sales) === 1,
    tombstones?.[0]
      ? `${tombstones[0].shop_name}, ${tombstones[0].sales} sale(s), ${tombstones[0].member_count} member(s)`
      : "no tombstone",
  );

  // Nobody gets to read that table: an owner cannot enumerate what other shops
  // have been deleted, and cannot forge one.
  {
    const { error: readError } = await owner.from("shop_deletions").select("*").limit(1);
    check(
      "the tombstone table is invisible to a signed-in owner",
      Boolean(readError),
      readError?.message ?? "it was readable",
    );
  }
} catch (error) {
  check(
    "the suite ran to the end",
    false,
    error instanceof Error ? error.message : JSON.stringify(error),
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`failed: ${failed.map((r) => r.name).join(" | ")}`);
  process.exit(1);
}
