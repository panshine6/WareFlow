import { trpc } from "@/lib/trpc";
import type { Product } from "@/types/product";

/**
 * 云端产品数据管理 Hook
 * 使用 tRPC React Query 实现实时数据同步
 */
export function useCloudProducts() {
  // 获取活跃产品列表
  const activeProducts = trpc.products.getActive.useQuery(undefined, {
    refetchInterval: 30000, // 每 30 秒自动刷新
  });

  // 获取已删除产品列表
  const deletedProducts = trpc.products.getDeleted.useQuery(undefined, {
    enabled: false, // 默认不自动加载
  });

  // 创建产品
  const createProduct = trpc.products.create.useMutation({
    onSuccess: () => {
      activeProducts.refetch();
    },
  });

  // 更新产品
  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => {
      activeProducts.refetch();
    },
  });

  // 软删除产品
  const softDeleteProduct = trpc.products.softDelete.useMutation({
    onSuccess: () => {
      activeProducts.refetch();
      deletedProducts.refetch();
    },
  });

  // 恢复产品
  const restoreProduct = trpc.products.restore.useMutation({
    onSuccess: () => {
      activeProducts.refetch();
      deletedProducts.refetch();
    },
  });

  // 永久删除产品
  const permanentDeleteProduct = trpc.products.permanentDelete.useMutation({
    onSuccess: () => {
      deletedProducts.refetch();
    },
  });

  // 合并产品
  const mergeProduct = trpc.products.merge.useMutation({
    onSuccess: () => {
      activeProducts.refetch();
    },
  });

  // 清理旧数据
  const cleanupOld = trpc.products.cleanupOld.useMutation({
    onSuccess: () => {
      deletedProducts.refetch();
    },
  });

  return {
    // 查询
    activeProducts: activeProducts.data || [],
    deletedProducts: deletedProducts.data || [],
    isLoading: activeProducts.isLoading,
    isError: activeProducts.isError,
    error: activeProducts.error,

    // 操作
    createProduct: createProduct.mutateAsync,
    updateProduct: updateProduct.mutateAsync,
    softDeleteProduct: softDeleteProduct.mutateAsync,
    restoreProduct: restoreProduct.mutateAsync,
    permanentDeleteProduct: permanentDeleteProduct.mutateAsync,
    mergeProduct: mergeProduct.mutateAsync,
    cleanupOld: cleanupOld.mutateAsync,

    // 刷新
    refetch: activeProducts.refetch,
    refetchDeleted: deletedProducts.refetch,
  };
}

/**
 * 获取单个产品详情（包含历史记录）
 */
export function useCloudProduct(productId: string | null) {
  const product = trpc.products.getById.useQuery(
    { id: productId! },
    {
      enabled: !!productId,
    }
  );

  const history = trpc.products.getHistory.useQuery(
    { productId: productId! },
    {
      enabled: !!productId,
    }
  );

  return {
    product: product.data,
    history: history.data || [],
    isLoading: product.isLoading || history.isLoading,
    isError: product.isError || history.isError,
    error: product.error || history.error,
    refetch: () => {
      product.refetch();
      history.refetch();
    },
  };
}

/**
 * 搜索产品
 */
export function useSearchProducts(sku: string) {
  const search = trpc.products.search.useQuery(
    { sku },
    {
      enabled: sku.length > 0,
    }
  );

  return {
    results: search.data || [],
    isLoading: search.isLoading,
    isError: search.isError,
    error: search.error,
  };
}
