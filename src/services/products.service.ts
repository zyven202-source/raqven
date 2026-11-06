/**
 * Product catalogue and categories.
 *
 * Every function is scoped to one shop and relies on RLS for isolation — the
 * `shopId` arguments make the intent explicit and give PostgREST an index to
 * use; they are never the thing that protects the data.
 */
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics-tracker";
import { ANALYTICS_EVENTS } from "@/services/analytics.service";
import type { Category, Product, ProductUpdate } from "@/types/savo";

/** Only the columns the list screens render — never `select("*")` on products. */
const PRODUCT_COLUMNS =
  "id, shop_id, category_id, name, sku, barcode, unit, buying_price, selling_price, quantity, low_stock_threshold, is_low_stock, image_url, is_active, created_at, updated_at";

/**
 * Strips characters that would break PostgREST's filter grammar, so a product
 * search can never be turned into a different query.
 */
function sanitizeSearch(term: string) {
  return term.replace(/[,()*%\\]/g, "").trim();
}

export interface ListProductsOptions {
  shopId: string;
  /** Free-text search across name and barcode. */
  search?: string | undefined;
  categoryId?: string | undefined;
  /** Only products at or below their low-stock threshold. */
  lowStockOnly?: boolean | undefined;
  /** Include archived products (default: only active ones). */
  includeArchived?: boolean | undefined;
  limit?: number;
}

export async function listProducts(options: ListProductsOptions): Promise<Product[]> {
  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("shop_id", options.shopId)
    .order("name", { ascending: true })
    .limit(options.limit ?? 100);

  if (!options.includeArchived) query = query.eq("is_active", true);
  if (options.lowStockOnly) query = query.eq("is_low_stock", true);
  if (options.categoryId) query = query.eq("category_id", options.categoryId);

  const term = options.search ? sanitizeSearch(options.search) : "";
  if (term) query = query.or(`name.ilike.%${term}%,barcode.ilike.%${term}%,sku.ilike.%${term}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Exact barcode lookup — the POS scanner path. */
export async function findProductByBarcode(
  shopId: string,
  barcode: string,
): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("shop_id", shopId)
    .eq("barcode", barcode.trim())
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProduct(productId: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", productId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface CreateProductInput {
  shopId: string;
  name: string;
  barcode?: string | null;
  sku?: string | null;
  categoryId?: string | null;
  unit?: string;
  buyingPrice: number;
  sellingPrice: number;
  lowStockThreshold: number;
  imageUrl?: string | null;
  /** Booked as an `opening` movement so the ledger explains the quantity. */
  openingQuantity?: number;
}

/**
 * Creates a product and, when there is opening stock, books it as an `opening`
 * inventory movement rather than writing the quantity directly. That keeps the
 * rule "every stock change has a movement" true from the very first unit.
 */
export async function createProduct(input: CreateProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .insert({
      shop_id: input.shopId,
      name: input.name.trim(),
      barcode: input.barcode?.trim() || null,
      sku: input.sku?.trim() || null,
      category_id: input.categoryId ?? null,
      unit: input.unit || "pc",
      buying_price: input.buyingPrice,
      selling_price: input.sellingPrice,
      low_stock_threshold: input.lowStockThreshold,
      image_url: input.imageUrl ?? null,
      quantity: 0,
    })
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) throw error;

  trackEvent(ANALYTICS_EVENTS.productCreated, { shopId: input.shopId });

  const opening = input.openingQuantity ?? 0;
  if (opening > 0) {
    const { error: moveError } = await supabase.rpc("record_stock_movement", {
      p_product_id: data.id,
      p_movement_type: "opening",
      p_quantity: opening,
      p_notes: "Opening stock",
    });
    if (moveError) {
      // The product exists but its stock does not — say so instead of leaving a
      // half-created row that looks fine.
      throw new Error(
        `Product saved, but the opening stock could not be recorded: ${moveError.message}`,
      );
    }
    return { ...data, quantity: opening };
  }

  return data;
}

export interface UpdateProductInput {
  name?: string;
  barcode?: string | null;
  sku?: string | null;
  categoryId?: string | null;
  unit?: string;
  buyingPrice?: number;
  sellingPrice?: number;
  lowStockThreshold?: number;
  imageUrl?: string | null;
  isActive?: boolean;
}

export async function updateProduct(
  productId: string,
  patch: UpdateProductInput,
): Promise<Product> {
  const update: ProductUpdate = {};
  if (patch.name !== undefined) update["name"] = patch.name.trim();
  if (patch.barcode !== undefined) update["barcode"] = patch.barcode?.trim() || null;
  if (patch.sku !== undefined) update["sku"] = patch.sku?.trim() || null;
  if (patch.categoryId !== undefined) update["category_id"] = patch.categoryId;
  if (patch.unit !== undefined) update["unit"] = patch.unit;
  if (patch.buyingPrice !== undefined) update["buying_price"] = patch.buyingPrice;
  if (patch.sellingPrice !== undefined) update["selling_price"] = patch.sellingPrice;
  if (patch.lowStockThreshold !== undefined)
    update["low_stock_threshold"] = patch.lowStockThreshold;
  if (patch.imageUrl !== undefined) update["image_url"] = patch.imageUrl;
  if (patch.isActive !== undefined) update["is_active"] = patch.isActive;

  const { data, error } = await supabase
    .from("products")
    .update(update)
    .eq("id", productId)
    .select(PRODUCT_COLUMNS)
    .single();
  if (error) throw error;

  // Archiving is an update with `is_active: false`; it is its own event so the
  // console can tell it apart from an ordinary edit.
  trackEvent(
    patch.isActive === false ? ANALYTICS_EVENTS.productArchived : ANALYTICS_EVENTS.productUpdated,
    { shopId: data.shop_id },
  );

  return data;
}

/**
 * Deletes a product, but only while doing so destroys no history.
 *
 * `inventory_movements` cascades on product delete, so removing a product that
 * has ever moved would silently erase its ledger. Instead this refuses and
 * tells the caller to archive it.
 */
export async function deleteProduct(productId: string): Promise<void> {
  const { count: saleCount, error: saleError } = await supabase
    .from("sale_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  if (saleError) throw saleError;

  const { count: moveCount, error: moveError } = await supabase
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  if (moveError) throw moveError;

  if ((saleCount ?? 0) > 0 || (moveCount ?? 0) > 0) {
    throw new Error(
      "This product has sales or stock history, so deleting it would erase that record. Archive it instead.",
    );
  }

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) throw error;
}

/** Archived products keep their history but disappear from the POS. */
export function archiveProduct(productId: string) {
  return updateProduct(productId, { isActive: false });
}

export async function restoreProduct(productId: string) {
  return updateProduct(productId, { isActive: true });
}

// ---------------------------------------------------------------- categories

export async function listCategories(shopId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, shop_id, name, description, created_at, updated_at")
    .eq("shop_id", shopId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(
  shopId: string,
  name: string,
  description?: string | null,
): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert({ shop_id: shopId, name: name.trim(), description: description ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) throw error;
}
