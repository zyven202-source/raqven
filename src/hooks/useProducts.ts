import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveProduct,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  listCategories,
  listProducts,
  updateProduct,
  type CreateProductInput,
  type ListProductsOptions,
  type UpdateProductInput,
} from "@/services/products.service";

/**
 * Query keys always carry the shop id.
 *
 * This is what makes shop switching safe: a different shop is a different key,
 * so React Query cannot serve the previous shop's rows from cache — there is no
 * "invalidate on switch" step that could be forgotten.
 */
export const productKeys = {
  list: (shopId: string, filters: Record<string, unknown>) =>
    ["products", shopId, filters] as const,
  categories: (shopId: string) => ["categories", shopId] as const,
};

/** Invalidates everything a product write can affect. */
function useProductInvalidation(shopId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["products", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["transactions", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["report", shopId] });
  };
}

export function useProducts(options: ListProductsOptions) {
  return useQuery({
    queryKey: productKeys.list(options.shopId, {
      search: options.search ?? "",
      categoryId: options.categoryId ?? "",
      lowStockOnly: options.lowStockOnly ?? false,
      includeArchived: options.includeArchived ?? false,
    }),
    queryFn: () => listProducts(options),
    enabled: Boolean(options.shopId),
    placeholderData: (previous) => previous,
  });
}

export function useCategories(shopId: string) {
  return useQuery({
    queryKey: productKeys.categories(shopId),
    queryFn: () => listCategories(shopId),
    enabled: Boolean(shopId),
  });
}

export function useCreateProduct(shopId: string) {
  const invalidate = useProductInvalidation(shopId);
  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(input),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct(shopId: string) {
  const invalidate = useProductInvalidation(shopId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateProductInput }) =>
      updateProduct(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteProduct(shopId: string) {
  const invalidate = useProductInvalidation(shopId);
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: invalidate,
  });
}

export function useArchiveProduct(shopId: string) {
  const invalidate = useProductInvalidation(shopId);
  return useMutation({
    mutationFn: (id: string) => archiveProduct(id),
    onSuccess: invalidate,
  });
}

export function useCreateCategory(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string | null }) =>
      createCategory(shopId, name, description),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productKeys.categories(shopId) });
    },
  });
}

export function useDeleteCategory(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productKeys.categories(shopId) });
      void queryClient.invalidateQueries({ queryKey: ["products", shopId] });
    },
  });
}
