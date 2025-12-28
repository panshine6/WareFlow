/**
 * 云端 API 客户端
 * 直接调用后端 tRPC API，替代 AsyncStorage
 */

import type { Product } from "@/types/product";

// 获取 API 基础 URL
const getApiBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  return "https://web-production-e22eb.up.railway.app";
};

/**
 * 产品 API 客户端
 */
export const ProductAPI = {
  /**
   * 获取所有产品（包含已删除的）
   */
  async getAll(): Promise<Product[]> {
    try {
      console.log("[API] Fetching all products...");
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/trpc/products.getAll`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const products = data.result?.data?.json ?? [];
      console.log("[API] Fetched", products.length, "products");
      return products;
    } catch (error) {
      console.error("[API] Failed to fetch all products:", error);
      return [];
    }
  },

  /**
   * 获取活跃产品（未删除的）
   */
  async getActive(): Promise<Product[]> {
    try {
      console.log("[API] Fetching active products...");
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/trpc/products.getActive`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const products = data.result?.data?.json ?? [];
      console.log("[API] Fetched", products.length, "active products");
      return products;
    } catch (error) {
      console.error("[API] Failed to fetch active products:", error);
      return [];
    }
  },

  /**
   * 获取已删除产品
   */
  async getDeleted(): Promise<Product[]> {
    try {
      console.log("[API] Fetching deleted products...");
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/trpc/products.getDeleted`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const products = data.result?.data?.json ?? [];
      console.log("[API] Fetched", products.length, "deleted products");
      return products;
    } catch (error) {
      console.error("[API] Failed to fetch deleted products:", error);
      return [];
    }
  },

  /**
   * 根据 ID 获取产品
   */
  async getById(id: string): Promise<Product | null> {
    try {
      console.log("[API] Fetching product by ID:", id);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(
        `${apiBaseUrl}/api/trpc/products.getById?input=${encodeURIComponent(JSON.stringify({ json: { id } }))}`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const product = data.result?.data?.json ?? null;
      console.log("[API] Fetched product:", product?.id);
      return product;
    } catch (error) {
      console.error("[API] Failed to fetch product:", error);
      return null;
    }
  },

  /**
   * 搜索产品（按 SKU）
   */
  async search(sku: string): Promise<Product[]> {
    try {
      console.log("[API] Searching products by SKU:", sku);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(
        `${apiBaseUrl}/api/trpc/products.search?input=${encodeURIComponent(JSON.stringify({ json: { sku } }))}`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const products = data.result?.data?.json ?? [];
      console.log("[API] Found", products.length, "products");
      return products;
    } catch (error) {
      console.error("[API] Failed to search products:", error);
      return [];
    }
  },

  /**
   * 创建新产品
   */
  async create(product: Omit<Product, "createdAt" | "updatedAt">): Promise<void> {
    try {
      console.log("[API] Creating product:", product.id);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/trpc/products.create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: product,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[API] Create product error:", errorText);
        throw new Error(`API request failed: ${response.statusText}`);
      }

      console.log("[API] Product created successfully");
    } catch (error) {
      console.error("[API] Failed to create product:", error);
      throw error;
    }
  },

  /**
   * 更新产品
   */
  async update(id: string, updates: Partial<Product>): Promise<void> {
    try {
      console.log("[API] Updating product:", id);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/trpc/products.update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: { id, ...updates },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[API] Update product error:", errorText);
        throw new Error(`API request failed: ${response.statusText}`);
      }

      console.log("[API] Product updated successfully");
    } catch (error) {
      console.error("[API] Failed to update product:", error);
      throw error;
    }
  },

  /**
   * 软删除产品
   */
  async softDelete(id: string): Promise<void> {
    try {
      console.log("[API] Soft deleting product:", id);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/trpc/products.softDelete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: { id },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[API] Soft delete product error:", errorText);
        throw new Error(`API request failed: ${response.statusText}`);
      }

      console.log("[API] Product soft deleted successfully");
    } catch (error) {
      console.error("[API] Failed to soft delete product:", error);
      throw error;
    }
  },

  /**
   * 恢复已删除产品
   */
  async restore(id: string): Promise<void> {
    try {
      console.log("[API] Restoring product:", id);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/trpc/products.restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: { id },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[API] Restore product error:", errorText);
        throw new Error(`API request failed: ${response.statusText}`);
      }

      console.log("[API] Product restored successfully");
    } catch (error) {
      console.error("[API] Failed to restore product:", error);
      throw error;
    }
  },

  /**
   * 永久删除产品
   */
  async permanentDelete(id: string): Promise<void> {
    try {
      console.log("[API] Permanently deleting product:", id);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/trpc/products.permanentDelete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: { id },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[API] Permanent delete product error:", errorText);
        throw new Error(`API request failed: ${response.statusText}`);
      }

      console.log("[API] Product permanently deleted successfully");
    } catch (error) {
      console.error("[API] Failed to permanently delete product:", error);
      throw error;
    }
  },

  /**
   * 合并产品（增加库存）
   */
  async merge(
    existingProductId: string,
    newEntry: {
      quantity: number;
      location: string;
      detailImageUri: string;
      overviewImageUri: string;
      operatorId: number;
      operatorName: string;
    }
  ): Promise<void> {
    try {
      console.log("[API] Merging product:", existingProductId);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/trpc/products.merge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: { existingProductId, ...newEntry },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[API] Merge product error:", errorText);
        throw new Error(`API request failed: ${response.statusText}`);
      }

      console.log("[API] Product merged successfully");
    } catch (error) {
      console.error("[API] Failed to merge product:", error);
      throw error;
    }
  },

  /**
   * 获取产品历史记录
   */
  async getHistory(productId: string): Promise<any[]> {
    try {
      console.log("[API] Fetching product history:", productId);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(
        `${apiBaseUrl}/api/trpc/products.getHistory?input=${encodeURIComponent(JSON.stringify({ json: { productId } }))}`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const history = data.result?.data?.json ?? [];
      console.log("[API] Fetched", history.length, "history records");
      return history;
    } catch (error) {
      console.error("[API] Failed to fetch product history:", error);
      return [];
    }
  },

  /**
   * 添加历史记录
   */
  async addHistory(entry: {
    id: string;
    productId: string;
    operatorId: number;
    operatorName: string;
    quantity: number;
    location: string;
    detailImageUri: string;
    overviewImageUri: string;
    notes?: string;
  }): Promise<void> {
    try {
      console.log("[API] Adding history entry:", entry.id);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/trpc/products.addHistory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: entry,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[API] Add history error:", errorText);
        throw new Error(`API request failed: ${response.statusText}`);
      }

      console.log("[API] History entry added successfully");
    } catch (error) {
      console.error("[API] Failed to add history entry:", error);
      throw error;
    }
  },
};
