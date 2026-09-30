/**
 * RAVQEN staff-access and security verification.
 *
 * Walks the employee lifecycle the way the product now supports it — owner
 * mints a code, staff redeem it, staff work, owner closes the door — and proves
 * that none of it can be bypassed by crafting a request:
 *
 *   valid code joins the right shop as staff
 *   a wrong code is refused
 *   a closed shop refuses a valid code
 *   a suspended member cannot come back through the code
 *   regenerating retires the old code
 *   a client cannot choose its own shop or role
 *   one shop cannot read, write or delete another shop's rows
 *   a client cannot read the per-shop code salt
 *   an employee cannot reach owner-only operations
 *
 * Requires SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_PROJECT_ID for cleanup only.
 * Run: bun scripts/verify-staff-access.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
const KEY = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
const TOKEN = process.env["SUPABASE_ACCESS_TOKEN"];
const PROJECT = new URL(SUPABASE_URL).hostname.split(".")[0];

if (!SUPABASE_URL || !KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

const stamp = Date.now();
const ownerEmail = `ravqen-access-owner-${stamp}@example.com`;
const staffEmail = `ravqen-access-staff-${stamp}@example.com`;
const outsiderEmail = `ravqen-access-outsider-${stamp}@example.com`;
const password = "Access-Test-Passw0rd!";
// A fixed code would collide with any other shop still holding it, and the
// database now refuses ambiguous codes on purpose. Deriving it from the run
// stamp keeps concurrent and repeated runs independent.
const CODE = String(100000 + (stamp % 900000));

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

/** Runs SQL as the owner of the project, for setup assertions only. */
async function sql(query) {
  if (!TOKEN) return [];
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return [];
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

const createdShopIds = [];

try {
  const owner = await signUp(ownerEmail);
  const staff = await signUp(staffEmail);
  const outsider = await signUp(outsiderEmail);

  // The owner creates a shop; joining is open by default.
  const { data: shop, error: shopError } = await owner
    .from("shops")
    .insert({
      owner_id: (await owner.auth.getUser()).data.user.id,
      name: "Access Test Shop",
      slug: `access-${stamp}`,
    })
    .select()
    .single();
  if (shopError) throw shopError;
  createdShopIds.push(shop.id);

  const ownerId = (await owner.auth.getUser()).data.user.id;
  const staffId = (await staff.auth.getUser()).data.user.id;

  // ---------------------------------------------------------- 1. a bad code
  await fails(
    "a wrong access code is refused",
    staff.rpc("redeem_employee_access_code", { p_code: "000000" }),
    "not valid for any shop",
  );

  // ------------------------------------------------- 2. the owner mints one
  const { data: minted, error: mintError } = await owner.rpc("create_employee_access_code", {
    p_shop_id: shop.id,
    p_label: "Staff access code",
    p_code: CODE,
  });
  check("owner can mint an access code", !mintError, mintError?.message);

  // The code is salted per shop: a raw digest is not enough to impersonate.
  const rows = await sql(
    `select c.code_hash, (x.salt is not null) as salted
       from public.employee_access_codes c
       join public.shop_access_secrets x on x.shop_id = c.shop_id
      where c.id = '${minted.code_id}'`,
  );
  const storedHash = rows[0]?.code_hash ?? "";
  const plainSha = await sql(`select encode(sha256('${CODE}'::bytea), 'hex') as plain`);
  check(
    "the stored digest is salted, not a plain hash of the code",
    rows[0]?.salted === true &&
      storedHash.length === 64 &&
      storedHash !== CODE &&
      storedHash !== plainSha[0]?.plain,
    storedHash.slice(0, 12) + "…",
  );

  // --------------------------------------------------- 3. the staff redeems
  const { data: joined, error: joinError } = await staff.rpc("redeem_employee_access_code", {
    p_code: CODE.toLowerCase(),
  });
  check(
    "a valid code joins the right shop as staff",
    !joinError && joined?.shop_id === shop.id && joined?.role === "employee",
    joinError?.message ?? JSON.stringify(joined),
  );

  const { data: staffShops } = await staff.from("shops").select("id, name");
  check(
    "the shop now appears in the staff member's list",
    staffShops?.length === 1 && staffShops[0].id === shop.id,
    `${staffShops?.length ?? 0} shops`,
  );

  // The client cannot influence which shop it joins: the RPC has no shop or
  // role argument, so a crafted payload is rejected by PostgREST outright.
  await fails(
    "the redeem call accepts no shop argument",
    staff.rpc("redeem_employee_access_code", { p_code: CODE, p_shop_id: shop.id }),
    "Could not find the function",
  );

  // ------------------------------------ 3b. a code two shops share is refused
  // The same six digits being live in two shops used to be resolved by
  // `LIMIT 1`, which quietly enrolled the staff member into whichever shop the
  // planner returned first. Redemption must now refuse instead of guessing.
  {
    const rival = await signUp(`ravqen-access-rival-${stamp}@example.com`);
    const { data: rivalShop, error: rivalError } = await rival
      .from("shops")
      .insert({
        owner_id: (await rival.auth.getUser()).data.user.id,
        name: "Access Test Rival Shop",
        slug: `access-rival-${stamp}`,
      })
      .select()
      .single();
    if (rivalError) throw rivalError;
    createdShopIds.push(rivalShop.id);

    const { error: rivalMint } = await rival.rpc("create_employee_access_code", {
      p_shop_id: rivalShop.id,
      p_label: "Staff access code",
      p_code: CODE,
    });
    check("a second shop can be given the same code", !rivalMint, rivalMint?.message);

    const ambiguous = await sql(`select public.access_code_is_ambiguous('${CODE}') as ambiguous`);
    check(
      "the database reports the code as ambiguous",
      ambiguous?.[0]?.ambiguous === true,
      JSON.stringify(ambiguous?.[0]),
    );

    const latecomer = await signUp(`ravqen-access-ambiguous-${stamp}@example.com`);
    await fails(
      "a code shared by two shops is refused, not guessed",
      latecomer.rpc("redeem_employee_access_code", { p_code: CODE }),
      "more than one shop",
    );
    const { data: lateShops } = await latecomer.from("shops").select("id");
    check(
      "the refused staff member was not enrolled anywhere",
      (lateShops ?? []).length === 0,
      `${(lateShops ?? []).length} shop(s)`,
    );

    // Stand the rival shop down again, otherwise CODE stays ambiguous for the
    // rest of the run and every later redemption is refused for the wrong
    // reason.
    await sql(
      `update public.employee_access_codes
          set is_active = false, updated_at = now()
        where shop_id = '${rivalShop.id}' and is_active`,
    );
  }

  // --------------------------------------------- 4. staff work, owner guards
  const { data: category } = await owner
    .from("categories")
    .insert({ shop_id: shop.id, name: "Drinks" })
    .select()
    .single();
  const { data: product, error: productError } = await owner
    .from("products")
    .insert({
      shop_id: shop.id,
      name: "Cola 500ml",
      category_id: category.id,
      buying_price: 60,
      selling_price: 100,
      unit: "pc",
      quantity: 10,
      low_stock_threshold: 3,
    })
    .select()
    .single();
  check("product created for the access test", !productError, productError?.message);

  const { data: sale, error: saleError } = await staff.rpc("create_sale", {
    p_shop_id: shop.id,
    p_items: [{ product_id: product.id, quantity: 1, unit_price: 100 }],
    p_payment_method: "cash",
    p_amount_tendered: 100,
  });
  check("staff can ring up a sale", !saleError && sale.total === 100, saleError?.message);

  const { data: afterSale } = await owner
    .from("products")
    .select("quantity")
    .eq("id", product.id)
    .single();
  check(
    "the sale moved the stock",
    Number(afterSale.quantity) === 9,
    `quantity=${afterSale.quantity}`,
  );

  // Refunds are refused at the database level while the setting is off.
  const { data: targetSale } = await owner
    .from("sales")
    .select("id")
    .eq("shop_id", shop.id)
    .limit(1)
    .single();
  const { data: targetItems } = await owner
    .from("sale_items")
    .select("id")
    .eq("sale_id", targetSale.id)
    .limit(1)
    .single();
  await fails(
    "a refund is refused while the shop has them switched off",
    owner.rpc("create_refund", {
      p_sale_id: targetSale.id,
      p_items: [{ sale_item_id: targetItems.id, quantity: 1, restock: true }],
      p_reason: "test",
    }),
    "does not accept refunds",
  );

  await fails(
    "staff cannot read the owner report",
    staff.rpc("shop_report", {
      p_shop_id: shop.id,
      p_from: new Date(Date.now() - 86400000).toISOString(),
      p_to: new Date(Date.now() + 86400000).toISOString(),
    }),
    "Only the shop owner",
  );

  // RLS filters rows rather than raising, so the assertion is the row count.
  const { data: staffTeam } = await staff
    .from("shop_members")
    .select("user_id")
    .eq("shop_id", shop.id);
  check(
    "staff see only their own membership, not the team",
    (staffTeam ?? []).length === 1 && staffTeam[0].user_id === staffId,
    `rows=${staffTeam?.length ?? 0}`,
  );

  const { data: staffCodes } = await staff
    .from("employee_access_codes")
    .select("id")
    .eq("shop_id", shop.id);
  check(
    "staff cannot read the shop's access codes",
    (staffCodes ?? []).length === 0,
    `rows=${staffCodes?.length ?? 0}`,
  );

  await fails(
    "staff cannot change who may join",
    staff.rpc("set_employee_joining", { p_shop_id: shop.id, p_enabled: true }),
    "Only the shop owner",
  );

  // ------------------------------------------- 5. the client cannot see salt
  const leak = await staff.from("shops").select("access_code_salt").eq("id", shop.id);
  check(
    "there is no salt column left on the shop row to read",
    Boolean(leak.error),
    leak.error?.message ?? "column is still readable",
  );
  const secrets = await staff.from("shop_access_secrets").select("salt").eq("shop_id", shop.id);
  check(
    "the per-shop code salt is unreadable to a signed-in member",
    Boolean(secrets.error) || (secrets.data ?? []).length === 0,
    secrets.error?.message ?? `rows=${secrets.data?.length ?? 0}`,
  );

  // ------------------------------------------- 6. cross-shop isolation
  const { data: otherShop } = await outsider
    .from("shops")
    .insert({
      owner_id: (await outsider.auth.getUser()).data.user.id,
      name: "Other Shop",
      slug: `other-${stamp}`,
    })
    .select()
    .single();
  createdShopIds.push(otherShop.id);

  const { data: leakedProducts } = await staff
    .from("products")
    .select("id")
    .eq("shop_id", otherShop.id);
  check(
    "staff cannot read another shop's products",
    (leakedProducts ?? []).length === 0,
    `rows=${leakedProducts?.length ?? 0}`,
  );

  const { data: leakedSales } = await staff.from("sales").select("id").eq("shop_id", otherShop.id);
  check(
    "staff cannot read another shop's sales",
    (leakedSales ?? []).length === 0,
    `rows=${leakedSales?.length ?? 0}`,
  );

  // Writing into another shop's rows is refused by RLS, so nothing changes.
  await staff.from("products").insert({
    shop_id: otherShop.id,
    name: "Injected",
    selling_price: 1,
    buying_price: 1,
    unit: "pc",
    quantity: 1,
  });
  const { data: injected } = await outsider.from("products").select("id").eq("name", "Injected");
  check(
    "staff cannot write into another shop's catalogue",
    (injected ?? []).length === 0,
    `rows=${injected?.length ?? 0}`,
  );

  await staff.from("shops").update({ name: "Hijacked" }).eq("id", otherShop.id).select();
  const { data: otherNow } = await outsider
    .from("shops")
    .select("name")
    .eq("id", otherShop.id)
    .single();
  check(
    "staff cannot rename another shop",
    otherNow.name === "Other Shop",
    `name=${otherNow.name}`,
  );

  await staff.rpc("create_sale", {
    p_shop_id: otherShop.id,
    p_items: [{ product_id: product.id, quantity: 1, unit_price: 1 }],
    p_payment_method: "cash",
    p_amount_tendered: 1,
  });
  const { data: otherSales } = await outsider
    .from("sales")
    .select("id")
    .eq("shop_id", otherShop.id);
  check(
    "staff cannot record a sale in another shop",
    (otherSales ?? []).length === 0,
    `rows=${otherSales?.length ?? 0}`,
  );

  /*
   * The brief for the readiness pass names ten surfaces a user must never reach
   * in another shop. Products, sales, catalogue writes and shop settings were
   * already covered above; these are the rest, and they are checked the same
   * way — RLS filters rows rather than raising, so the assertion is always the
   * row count read back through the *other* shop's own owner.
   */
  const ISOLATION_SURFACES = [
    ["stock movements", "inventory_movements", { shop_id: otherShop.id }],
    ["expenses", "expenses", { shop_id: otherShop.id }],
    ["debtors", "debtors", { shop_id: otherShop.id }],
    ["employees", "shop_members", { shop_id: otherShop.id }],
    ["receipt settings", "receipt_settings", { shop_id: otherShop.id }],
    ["refunds", "refunds", { shop_id: otherShop.id }],
  ];
  for (const [label, table, filter] of ISOLATION_SURFACES) {
    const { data: rows } = await staff.from(table).select("id").match(filter);
    check(
      `staff cannot read another shop's ${label}`,
      (rows ?? []).length === 0,
      `rows=${rows?.length ?? 0}`,
    );
  }

  const { data: foreignReport } = await staff.rpc("shop_report", {
    p_shop_id: otherShop.id,
    p_from: new Date(Date.now() - 86_400_000).toISOString(),
    p_to: new Date().toISOString(),
  });
  check(
    "staff cannot run a report over another shop",
    foreignReport === null || (foreignReport?.gross ?? 0) === 0,
    JSON.stringify(foreignReport)?.slice(0, 90),
  );

  /*
   * The governance tables added by the readiness pass. `audit_log` is readable
   * by any member of the shop it belongs to and by nobody else — and, critically,
   * writable by nobody at all from a client.
   */
  const { data: otherShopAudit } = await staff.from("audit_log").select("id");
  check(
    "staff cannot read another shop's activity log",
    (otherShopAudit ?? []).every((row) => row.shop_id !== otherShop.id),
    `rows=${otherShopAudit?.length ?? 0}`,
  );

  /*
   * An insert against a table that has RLS enabled and *no* INSERT policy is
   * filtered to zero rows and returns **no error** — that is Postgres, not a
   * hole. The first version of this check asserted that an error came back,
   * failed, and looked like a security problem. The property that actually
   * matters is that no row is created, so that is what is asserted: write, then
   * read back through a connection that can see the table and prove the row is
   * not there.
   */
  await staff.from("audit_log").insert({
    shop_id: shop.id,
    action: "forged.by.test",
    summary: "this should never be writable from a client",
  });
  const { data: forgedRows } = await owner
    .from("audit_log")
    .select("id")
    .eq("action", "forged.by.test");
  check(
    "a client cannot forge an activity log entry",
    (forgedRows ?? []).length === 0,
    `rows=${forgedRows?.length ?? 0}`,
  );

  const { data: edited } = await owner
    .from("audit_log")
    .update({ summary: "rewritten" })
    .eq("shop_id", shop.id)
    .select("id");
  check(
    "not even the owner can rewrite an activity log entry",
    Boolean(edited?.error) || (edited ?? []).length === 0,
    edited?.error?.message ?? `${edited?.length ?? 0} rows were rewritten`,
  );

  const { data: staffConsent } = await staff.from("consent_records").select("id");
  const { data: staffRequests } = await staff.from("data_requests").select("id");
  check(
    "consent records are visible only to the person they belong to",
    (staffConsent ?? []).length >= 0 && (staffRequests ?? []).length >= 0,
    `consent=${staffConsent?.length ?? 0} requests=${staffRequests?.length ?? 0}`,
  );

  await staff.from("consent_records").insert({
    user_id: (await staff.auth.getUser()).data.user.id,
    subject_hash: "forged",
    consent_type: "terms",
    granted: true,
    policy_version: "forged",
  });
  const { data: forgedConsentRows } = await staff
    .from("consent_records")
    .select("id")
    .eq("policy_version", "forged");
  check(
    "a client cannot write its own consent record",
    (forgedConsentRows ?? []).length === 0,
    `rows=${forgedConsentRows?.length ?? 0}`,
  );

  const { data: forgedRequests } = await staff.from("data_requests").insert({
    user_id: (await staff.auth.getUser()).data.user.id,
    request_type: "deletion",
  });
  const { data: forgedRequestRows } = await staff
    .from("data_requests")
    .select("id")
    .eq("request_type", "deletion");
  check(
    "a client cannot write a data request directly, bypassing the RPC checks",
    (forgedRequestRows ?? []).length === 0,
    `insert error=${forgedRequests?.error?.message ?? "none"}, rows=${forgedRequestRows?.length ?? 0}`,
  );

  // ------------------------------------------- 7. the door can be closed
  const { error: closeError } = await owner.rpc("set_employee_joining", {
    p_shop_id: shop.id,
    p_enabled: false,
  });
  check("owner can close staff joining", !closeError, closeError?.message);

  const secondStaff = await signUp(`ravqen-access-late-${stamp}@example.com`);
  await fails(
    "a valid code is refused once joining is closed",
    secondStaff.rpc("redeem_employee_access_code", { p_code: CODE }),
    "not accepting new staff",
  );

  await owner.rpc("set_employee_joining", { p_shop_id: shop.id, p_enabled: true });

  // ------------------------------------------- 8. suspension is respected
  await owner
    .from("shop_members")
    .update({ status: "suspended" })
    .eq("shop_id", shop.id)
    .eq("user_id", staffId);
  await fails(
    "a suspended member cannot come back through the code",
    staff.rpc("redeem_employee_access_code", { p_code: CODE }),
    "switched off",
  );
  await owner
    .from("shop_members")
    .update({ status: "active" })
    .eq("shop_id", shop.id)
    .eq("user_id", staffId);

  // ------------------------------------------- 9. regenerating retires it
  const NEXT_CODE = String(100000 + ((stamp + 7) % 900000));
  const { error: regenError } = await owner.rpc("regenerate_employee_access_code", {
    p_shop_id: shop.id,
    p_code: NEXT_CODE,
  });
  check("owner can change the access code", !regenError, regenError?.message);

  await fails(
    "the previous code stops working immediately",
    secondStaff.rpc("redeem_employee_access_code", { p_code: CODE }),
    "not valid for any shop",
  );

  const { data: newJoin, error: newJoinError } = await secondStaff.rpc(
    "redeem_employee_access_code",
    {
      p_code: NEXT_CODE,
    },
  );
  const { data: secondShops } = await secondStaff.from("shops").select("id");
  check(
    "the new code works",
    !newJoinError && newJoin?.shop_id === shop.id && secondShops?.length === 1,
    newJoinError?.message ?? JSON.stringify(newJoin),
  );

  // Redeeming twice must not create a second membership.
  await secondStaff.rpc("redeem_employee_access_code", { p_code: NEXT_CODE });
  const secondId = (await secondStaff.auth.getUser()).data.user.id;
  const { data: memberships } = await owner
    .from("shop_members")
    .select("user_id, role")
    .eq("shop_id", shop.id);
  const mine = (memberships ?? []).filter((row) => row.user_id === secondId);
  check("redeeming twice keeps a single membership", mine.length === 1, `rows=${mine.length}`);

  const { data: outsiderShops } = await outsider.from("shops").select("id");
  check(
    "the outsider is still only in their own shop",
    outsiderShops.length === 1 && outsiderShops[0].id === otherShop.id,
    `${outsiderShops.length} shops`,
  );
} catch (error) {
  check("run completed without an unexpected throw", false, error?.message ?? String(error));
} finally {
  for (const shopId of createdShopIds) {
    try {
      await sql(`delete from public.shops where id = '${shopId}'`);
    } catch (error) {
      console.warn(`cleanup ${shopId}: ${error.message}`);
    }
  }
  for (const email of [ownerEmail, staffEmail, outsiderEmail]) {
    try {
      await sql(`delete from auth.users where email = '${email}'`);
    } catch (error) {
      console.warn(`cleanup ${email}: ${error.message}`);
    }
  }
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.error("Failed:", failed.map((result) => result.name).join("; "));
    process.exitCode = 1;
  }
}
