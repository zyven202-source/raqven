/**
 * SAVO Studio's save path.
 *
 * The exported PNG is a NEW object, and nothing here deletes a file. `updateProduct`
 * only repoints the product's `image_url`, and the listing update uses
 * `setListingImage` rather than the publishing path, because publishing removes
 * the image it replaces. An edit must never destroy the photograph it was made
 * from — the shop may want it back.
 */
import { copyProductImage, getListing, setListingImage } from "@/services/marketlink.service";
import { updateProduct } from "@/services/products.service";
import { uploadImage } from "@/services/storage.service";
import { STORAGE_BUCKETS } from "@/types/savo";

export interface SaveStudioPhotoInput {
  shopId: string;
  productId: string;
  file: File;
}

export interface SaveStudioPhotoResult {
  /** New object path in the private product-images bucket. */
  productPath: string;
  /** True when a Marketlink listing existed and now shows the edited photo. */
  listingUpdated: boolean;
}

export async function saveStudioPhoto(input: SaveStudioPhotoInput): Promise<SaveStudioPhotoResult> {
  // 1. Upload the rendered PNG as its own object.
  const productPath = await uploadImage(STORAGE_BUCKETS.productImages, input.shopId, input.file);

  // 2. Point the product at the new object. The previous object is left alone.
  await updateProduct(input.productId, { imageUrl: productPath });

  // 3. If the product is listed on Marketlink, copy the new photo into the
  //    public bucket and point the listing at that copy. The listing's previous
  //    object stays where it is.
  const listing = await getListing(input.shopId, input.productId);
  if (!listing) return { productPath, listingUpdated: false };

  const copied = await copyProductImage(input.shopId, productPath);
  await setListingImage(input.shopId, input.productId, copied);

  return { productPath, listingUpdated: true };
}
