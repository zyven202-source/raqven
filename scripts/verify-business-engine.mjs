/**
 * RAVQEN business-engine verification.
 *
 * Exercises the real Supabase project through the real client API — no mocks,
 * no test doubles. It walks the whole acceptance flow from the product spec:
 *
 *   create shop -> opening stock -> cash sale -> credit sale -> debtor payment
 *   -> refund -> transaction ledger, then proves two independent shops cannot
 *   see or touch each other's data, and that an employee cannot reach
 *   owner-only operations.
 *
 * Requires SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_PROJECT_ID for cleanup only
 * (they are used to remove the throwaway accounts and shops afterwards).
 *
 * Run: bun scripts/verify-business-engine.mjs
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
const KEY = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
const TOKEN = process.env["SUPABASE_ACCESS_TOKEN"];
const PROJECT = process.env["VITE_SUPABASE_PROJECT_ID"];

if (!URL || !KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

const stamp = Date.now();
const ownerEmail = `ravqen-owner-${stamp}@example.com`;
const staffEmail = `ravqen-staff-${stamp}@example.com`;
const otherEmail = `ravqen-other-${stamp}@example.com`;
const password = "Engine-Test-Passw0rd!";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
/** Asserts a call rejects, and that the message names the real reason. */
async function checkFails(name, promise, expect) {
  const { error } = await promise;
  const message = error?.message ?? "";
  check(name, Boolean(error) && message.includes(expect), message || "expected an error");
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function client() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function makeUser(email, fullName) {
  const supabase = client();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone: "+254700000001" } },
  });
  if (error) throw new Error(`signUp(${email}): ${error.message}`);
  if (!data.session) throw new Error(`signUp(${email}): no session returned`);
  return supabase;
}

/** Creates a shop and returns it as the owner. */
async function makeShop(supabase, userId, name) {
  const { data, error } = await supabase
    .from("shops")
    .insert({
      owner_id: userId,
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`,
      business_type: "general",
      location: "Gikomba, Nairobi",
      phone: "+254700000001",
    })
    .select()
    .single();
  if (error) throw new Error(`create shop: ${error.message}`);
  return data;
}

const createdShopIds = [];

try {
  // ---------------------------------------------------------------- setup
  const owner = await makeUser(ownerEmail, "Owner One");
  const staff = await makeUser(staffEmail, "Staff Two");
  const other = await makeUser(otherEmail, "Other Three");

  const ownerId = (await owner.auth.getUser()).data.user.id;
  const staffId = (await staff.auth.getUser()).data.user.id;
  const otherId = (await other.auth.getUser()).data.user.id;

  const shopA = await makeShop(owner, ownerId, "Duka A");
  const shopB = await makeShop(other, otherId, "Duka B");
  createdShopIds.push(shopA.id, shopB.id);

  const { data: settings } = await owner
    .from("receipt_settings")
    .select("*")
    .eq("shop_id", shopA.id)
    .single();
  check("shop creation bootstraps receipt settings", Boolean(settings), settings?.receipt_prefix);

  // ------------------------------------------------------- products + stock
  const { data: category, error: catError } = await owner
    .from("categories")
    .insert({ shop_id: shopA.id, name: "Soft drinks" })
    .select()
    .single();
  check("category created", !catError, catError?.message ?? category?.name);

  const { data: product, error: prodError } = await owner
    .from("products")
    .insert({
      shop_id: shopA.id,
      category_id: category.id,
      name: "Coca-Cola 500ml",
      barcode: `BAR${stamp}`,
      buying_price: 60,
      selling_price: 100,
      quantity: 0,
      low_stock_threshold: 5,
    })
    .select()
    .single();
  check(
    "product created starting at zero stock",
    !prodError && product.quantity === 0,
    prodError?.message,
  );

  await checkFails(
    "negative stock is rejected by the database",
    owner.from("products").insert({ shop_id: shopA.id, name: "Bad row", quantity: -5 }),
    "products_quantity_non_negative",
  );

  const { data: afterOpening, error: openingError } = await owner.rpc("record_stock_movement", {
    p_product_id: product.id,
    p_movement_type: "opening",
    p_quantity: 50,
    p_notes: "Opening count",
  });
  check(
    "opening stock recorded",
    !openingError && afterOpening.quantity === 50,
    openingError?.message,
  );

  await checkFails(
    "stock cannot be driven below zero",
    owner.rpc("record_stock_movement", {
      p_product_id: product.id,
      p_movement_type: "adjustment",
      p_quantity: -500,
    }),
    "Insufficient stock",
  );

  // -------------------------------------------------------------- cash sale
  const { data: cashSale, error: cashError } = await owner.rpc("create_sale", {
    p_shop_id: shopA.id,
    p_items: [{ product_id: product.id, quantity: 2, unit_price: 100, discount_amount: 0 }],
    p_payment_method: "cash",
    p_amount_tendered: 250,
  });
  check(
    "cash sale completed with correct change",
    !cashError &&
      cashSale.total === 200 &&
      cashSale.change_due === 50 &&
      cashSale.status === "completed",
    cashError?.message ?? JSON.stringify(cashSale),
  );

  const { data: afterCash } = await owner
    .from("products")
    .select("quantity")
    .eq("id", product.id)
    .single();
  check("stock decreased by the sale", afterCash.quantity === 48, `quantity=${afterCash.quantity}`);

  const { data: cashItems } = await owner
    .from("sale_items")
    .select("*")
    .eq("sale_id", cashSale.sale_id);
  const { data: cashPayments } = await owner
    .from("payments")
    .select("*")
    .eq("sale_id", cashSale.sale_id);
  const { data: cashMoves } = await owner
    .from("inventory_movements")
    .select("*")
    .eq("reference_id", cashSale.sale_id);
  check(
    "sale wrote items + payment + stock movement atomically",
    cashItems.length === 1 && cashPayments.length === 1 && cashMoves.length === 1,
    `items=${cashItems.length} payments=${cashPayments.length} movements=${cashMoves.length}`,
  );

  await checkFails(
    "a sale cannot oversell stock",
    owner.rpc("create_sale", {
      p_shop_id: shopA.id,
      p_items: [{ product_id: product.id, quantity: 9999, unit_price: 100 }],
      p_payment_method: "cash",
      p_amount_tendered: 999900,
    }),
    "Insufficient stock",
  );

  await checkFails(
    "cash below the total is rejected",
    owner.rpc("create_sale", {
      p_shop_id: shopA.id,
      p_items: [{ product_id: product.id, quantity: 1, unit_price: 100 }],
      p_payment_method: "cash",
      p_amount_tendered: 40,
    }),
    "less than the total",
  );

  const { data: cashRows } = await owner.from("sales").select("id").eq("shop_id", shopA.id);
  check("failed sales left no rows behind", cashRows.length === 1, `sales=${cashRows.length}`);

  // ------------------------------------------------------------ credit sale
  const { data: creditSale, error: creditError } = await owner.rpc("create_sale", {
    p_shop_id: shopA.id,
    p_items: [{ product_id: product.id, quantity: 3, unit_price: 100 }],
    p_payment_method: "credit",
    p_amount_tendered: 100,
    p_debtor_name: "Jane Wanjiru",
    p_debtor_phone: "+254711222333",
  });
  check(
    "credit sale recorded as partly paid, not settled",
    !creditError &&
      creditSale.total === 300 &&
      creditSale.balance_due === 200 &&
      creditSale.status === "partial",
    creditError?.message ?? JSON.stringify(creditSale),
  );

  const { data: debtor } = await owner
    .from("debtors")
    .select("*")
    .eq("id", creditSale.debtor_id)
    .single();
  check(
    "debtor created with the outstanding balance",
    debtor.total_owed === 200,
    `owed=${debtor.total_owed}`,
  );

  // -------------------------------------------------------- debtor payment
  const { data: debtPayment, error: debtError } = await owner.rpc("record_debtor_payment", {
    p_debtor_id: debtor.id,
    p_amount: 120,
    p_method: "mpesa",
    p_reference: "QK12345678",
  });
  check(
    "partial debt payment reduced the balance",
    !debtError && debtPayment.balance_remaining === 80,
    debtError?.message ?? JSON.stringify(debtPayment),
  );

  const { data: saleAfterPayment } = await owner
    .from("sales")
    .select("balance_due, amount_paid, status")
    .eq("id", creditSale.sale_id)
    .single();
  check(
    "debt payment settled the sale's own balance",
    saleAfterPayment.balance_due === 80 && saleAfterPayment.status === "partial",
    JSON.stringify(saleAfterPayment),
  );

  await checkFails(
    "a debtor cannot overpay",
    owner.rpc("record_debtor_payment", { p_debtor_id: debtor.id, p_amount: 5000 }),
    "more than",
  );

  // --------------------------------------------------------------- refunds
  await checkFails(
    "refunds are refused while the shop does not accept them",
    owner.rpc("create_refund", {
      p_sale_id: cashSale.sale_id,
      p_items: [{ sale_item_id: cashItems[0].id, quantity: 1 }],
      p_reason: "Changed mind",
    }),
    "does not accept refunds",
  );

  const { error: toggleError } = await owner
    .from("shops")
    .update({ accepts_refunds: true })
    .eq("id", shopA.id);
  check("owner can turn refunds on", !toggleError, toggleError?.message);

  const { data: beforeRefund } = await owner
    .from("products")
    .select("quantity")
    .eq("id", product.id)
    .single();

  const { data: refund, error: refundError } = await owner.rpc("create_refund", {
    p_sale_id: cashSale.sale_id,
    p_items: [{ sale_item_id: cashItems[0].id, quantity: 1, restock: true }],
    p_reason: "Changed mind",
  });
  check(
    "refund recorded with the amount actually charged",
    !refundError && refund.total_amount === 100,
    refundError?.message ?? JSON.stringify(refund),
  );

  const { data: afterRefund } = await owner
    .from("products")
    .select("quantity")
    .eq("id", product.id)
    .single();
  check(
    "refund restored exactly the refunded quantity",
    Number(afterRefund.quantity) === Number(beforeRefund.quantity) + 1,
    `${beforeRefund.quantity} -> ${afterRefund.quantity}`,
  );

  await checkFails(
    "more cannot be refunded than was sold",
    owner.rpc("create_refund", {
      p_sale_id: cashSale.sale_id,
      p_items: [{ sale_item_id: cashItems[0].id, quantity: 5 }],
      p_reason: "Too many",
    }),
    "can still be refunded",
  );

  const { data: originalSale } = await owner.from("sales").select("id").eq("id", cashSale.sale_id);
  check("the original sale still exists after a refund", originalSale.length === 1);

  // -------------------------------------------------------------- expenses
  const { error: expenseError } = await owner.from("expenses").insert({
    shop_id: shopA.id,
    category: "transport",
    description: "Matatu to Gikomba",
    amount: 150,
    user_id: ownerId,
  });
  check("expense recorded", !expenseError, expenseError?.message);

  await checkFails(
    "an unknown expense category is refused",
    owner
      .from("expenses")
      .insert({ shop_id: shopA.id, category: "yacht", amount: 10, user_id: ownerId }),
    "expenses_category_valid",
  );

  // ------------------------------------------------- cross-shop isolation
  const { data: otherProduct, error: otherProductError } = await other
    .from("products")
    .insert({
      shop_id: shopB.id,
      name: "Other shop item",
      buying_price: 10,
      selling_price: 20,
      quantity: 4,
    })
    .select()
    .single();
  check("second shop has its own product", !otherProductError, otherProductError?.message);

  const { data: leaked } = await owner.from("products").select("id").eq("shop_id", shopB.id);
  check("shop A cannot read shop B products", leaked.length === 0, `rows=${leaked.length}`);

  const { data: leakedSales } = await owner.from("sales").select("id").eq("shop_id", shopB.id);
  check("shop A cannot read shop B sales", leakedSales.length === 0, `rows=${leakedSales.length}`);

  const { data: leakedShop } = await owner.from("shops").select("id").eq("id", shopB.id);
  check("shop A cannot read shop B itself", leakedShop.length === 0, `rows=${leakedShop.length}`);

  await checkFails(
    "shop A cannot sell out of shop B",
    owner.rpc("create_sale", {
      p_shop_id: shopB.id,
      p_items: [{ product_id: otherProduct.id, quantity: 1, unit_price: 20 }],
      p_payment_method: "cash",
      p_amount_tendered: 20,
    }),
    "Access denied",
  );

  await checkFails(
    "shop A cannot mint a receipt number for shop B",
    owner.rpc("next_receipt_number", { p_shop_id: shopB.id }),
    "Access denied",
  );

  // Shop B's own debtor, so the only thing standing between shop A and the
  // money is the membership check inside the SECURITY DEFINER function.
  const { data: shopBDebtor, error: shopBDebtorError } = await other
    .from("debtors")
    .insert({
      shop_id: shopB.id,
      name: "Sneaky",
      phone: `+2547${stamp % 100000000}`,
      total_owed: 10,
    })
    .select()
    .single();
  check("shop B has a debtor of its own", !shopBDebtorError, shopBDebtorError?.message);

  await checkFails(
    "shop A cannot pay down shop B's debtor",
    owner.rpc("record_debtor_payment", { p_debtor_id: shopBDebtor.id, p_amount: 5 }),
    "Access denied",
  );

  const { data: untouchedDebtor } = await other
    .from("debtors")
    .select("total_owed")
    .eq("id", shopBDebtor.id)
    .single();
  check(
    "shop B's balance was not touched",
    Number(untouchedDebtor.total_owed) === 10,
    `owed=${untouchedDebtor.total_owed}`,
  );

  // -------------------------------------------------------------- employee
  const { error: memberError } = await owner
    .from("shop_members")
    .insert({ shop_id: shopA.id, user_id: staffId, role: "employee", display_name: "Staff Two" });
  check("owner can add an employee", !memberError, memberError?.message);

  const { data: staffShops } = await staff.from("shops").select("id").eq("id", shopA.id);
  check("the employee can see the shop", staffShops.length === 1);

  const { data: employeeSale, error: employeeSaleError } = await staff.rpc("create_sale", {
    p_shop_id: shopA.id,
    p_items: [{ product_id: product.id, quantity: 1, unit_price: 100 }],
    p_payment_method: "cash",
    p_amount_tendered: 100,
  });
  check(
    "an employee can ring up a sale",
    !employeeSaleError && employeeSale.total === 100,
    employeeSaleError?.message,
  );

  await checkFails(
    "an employee cannot read owner reports",
    staff.rpc("shop_report", {
      p_shop_id: shopA.id,
      p_from: new Date(Date.now() - 86400000).toISOString(),
      p_to: new Date(Date.now() + 86400000).toISOString(),
    }),
    "Only the shop owner",
  );

  await checkFails(
    "an employee cannot mint access codes",
    staff.rpc("create_employee_access_code", {
      p_shop_id: shopA.id,
      p_label: "Till",
      p_code: "123456",
    }),
    "Only the shop owner",
  );

  // RLS filters the rows rather than raising, so the real assertion is that the
  // name is unchanged afterwards — not merely that the call did not throw.
  await staff.from("shops").update({ name: "Hijacked" }).eq("id", shopA.id).select();
  const { data: shopAfterHijack } = await owner
    .from("shops")
    .select("name")
    .eq("id", shopA.id)
    .single();
  check(
    "an employee cannot change the shop's settings",
    shopAfterHijack.name !== "Hijacked",
    `name=${shopAfterHijack.name}`,
  );

  const { data: staffTeamView } = await staff
    .from("shop_members")
    .select("user_id")
    .eq("shop_id", shopA.id)
    .neq("user_id", staffId);
  check(
    "an employee cannot enumerate the team",
    staffTeamView.length === 0,
    `rows=${staffTeamView.length}`,
  );

  const { data: staffStoleOwner } = await staff
    .from("shop_members")
    .update({ role: "owner" })
    .eq("shop_id", shopA.id)
    .eq("user_id", staffId)
    .select();
  const { data: staffRoleNow } = await staff
    .from("shop_members")
    .select("role")
    .eq("shop_id", shopA.id)
    .eq("user_id", staffId)
    .single();
  check(
    "an employee cannot promote themselves to owner",
    staffRoleNow.role === "employee",
    `updated=${staffStoleOwner?.length ?? 0} role=${staffRoleNow.role}`,
  );

  const { data: report, error: reportError } = await owner.rpc("shop_report", {
    p_shop_id: shopA.id,
    p_from: new Date(Date.now() - 86400000).toISOString(),
    p_to: new Date(Date.now() + 86400000).toISOString(),
  });
  check(
    "the owner can read the report",
    !reportError && Number(report.sales_count) === 3,
    reportError?.message ?? JSON.stringify(report),
  );

  const { data: code, error: codeError } = await owner.rpc("create_employee_access_code", {
    p_shop_id: shopA.id,
    p_label: "Till one",
    p_code: "482913",
  });
  check("owner can create an employee access code", !codeError, codeError?.message);

  // The plaintext must never be recoverable from the database.
  const stored = await sql(
    `select code_hash from public.employee_access_codes where id = '${code.code_id}'`,
  );
  const hash = stored[0]?.code_hash ?? "";
  check(
    "the access code is stored as a digest, not the code",
    hash.length === 64 && !hash.includes("482913"),
    `${hash.slice(0, 16)}…`,
  );

  await checkFails(
    "a short access code is refused",
    owner.rpc("create_employee_access_code", {
      p_shop_id: shopA.id,
      p_label: "Too short",
      p_code: "12",
    }),
    "at least 6 characters",
  );
} catch (error) {
  check("run completed without an unexpected throw", false, error?.message ?? String(error));
} finally {
  // ------------------------------------------------------------- cleanup
  for (const shopId of createdShopIds) {
    try {
      await sql(`delete from public.shops where id = '${shopId}'`);
    } catch (error) {
      console.error(`cleanup: shop ${shopId}: ${error.message}`);
    }
  }
  try {
    await sql(
      `delete from auth.users where email in ('${ownerEmail}','${staffEmail}','${otherEmail}')`,
    );
    check("throwaway accounts and shops removed", true);
  } catch (error) {
    check("throwaway accounts and shops removed", false, error.message);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) console.log(failed.map((f) => `  FAILED: ${f.name}`).join("\n"));
  process.exit(failed.length ? 1 : 0);
}
