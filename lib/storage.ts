import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Product, AppSettings } from "@/types/product";

const PRODUCTS_KEY = "products";
const SETTINGS_KEY = "settings";

/**
 * 产品数据存储工具
 */
export const ProductStorage = {
  /**
   * 获取所有产品记录（包含已删除的）
   */
  async getAll(): Promise<Product[]> {
    try {
      const data = await AsyncStorage.getItem(PRODUCTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to load products:", error);
      return [];
    }
  },

  /**
   * 获取活跃产品（未删除的）
   */
  async getActive(): Promise<Product[]> {
    try {
      const products = await this.getAll();
      return products.filter((p) => !p.isDeleted);
    } catch (error) {
      console.error("Failed to load active products:", error);
      return [];
    }
  },

  /**
   * 获取回收站产品（已删除的）
   */
  async getDeleted(): Promise<Product[]> {
    try {
      const products = await this.getAll();
      return products.filter((p) => p.isDeleted);
    } catch (error) {
      console.error("Failed to load deleted products:", error);
      return [];
    }
  },

  /**
   * 保存新产品记录
   */
  async add(product: Product): Promise<void> {
    try {
      const products = await this.getAll();
      products.unshift(product); // 新记录添加到开头
      await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
    } catch (error) {
      console.error("Failed to save product:", error);
      throw error;
    }
  },

  /**
   * 根据 ID 获取产品
   */
  async getById(id: string): Promise<Product | null> {
    try {
      const products = await this.getAll();
      return products.find((p) => p.id === id) || null;
    } catch (error) {
      console.error("Failed to get product:", error);
      return null;
    }
  },

  /**
   * 更新产品记录
   */
  async update(id: string, updates: Partial<Product>): Promise<void> {
    try {
      const products = await this.getAll();
      const index = products.findIndex((p) => p.id === id);
      if (index !== -1) {
        products[index] = { ...products[index], ...updates };
        await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
      }
    } catch (error) {
      console.error("Failed to update product:", error);
      throw error;
    }
  },

  /**
   * 软删除产品记录（移至回收站）
   */
  async softDelete(id: string): Promise<void> {
    try {
      const products = await this.getAll();
      const index = products.findIndex((p) => p.id === id);
      if (index !== -1) {
        products[index] = {
          ...products[index],
          isDeleted: true,
          deletedAt: new Date().toISOString(),
        };
        await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
      }
    } catch (error) {
      console.error("Failed to soft delete product:", error);
      throw error;
    }
  },

  /**
   * 恢复已删除的产品
   */
  async restore(id: string): Promise<void> {
    try {
      const products = await this.getAll();
      const index = products.findIndex((p) => p.id === id);
      if (index !== -1) {
        products[index] = {
          ...products[index],
          isDeleted: false,
          deletedAt: undefined,
        };
        await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
      }
    } catch (error) {
      console.error("Failed to restore product:", error);
      throw error;
    }
  },

  /**
   * 永久删除产品记录
   */
  async permanentDelete(id: string): Promise<void> {
    try {
      const products = await this.getAll();
      const filtered = products.filter((p) => p.id !== id);
      await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error("Failed to permanently delete product:", error);
      throw error;
    }
  },

  /**
   * 清理回收站中超过 90 天的产品
   */
  async cleanupOldDeleted(): Promise<number> {
    try {
      const products = await this.getAll();
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      
      let cleanedCount = 0;
      const filtered = products.filter((p) => {
        if (p.isDeleted && p.deletedAt) {
          const deletedDate = new Date(p.deletedAt);
          if (deletedDate < ninetyDaysAgo) {
            cleanedCount++;
            return false; // 删除超过 90 天的
          }
        }
        return true; // 保留其他产品
      });
      
      if (cleanedCount > 0) {
        await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(filtered));
      }
      
      return cleanedCount;
    } catch (error) {
      console.error("Failed to cleanup old deleted products:", error);
      return 0;
    }
  },

  /**
   * 按 SKU 搜索产品（仅搜索活跃产品）
   */
  async searchBySku(sku: string): Promise<Product[]> {
    try {
      const products = await this.getActive();
      const lowerSku = sku.toLowerCase();
      return products.filter((p) => p.sku.toLowerCase().includes(lowerSku));
    } catch (error) {
      console.error("Failed to search products:", error);
      return [];
    }
  },

  /**
   * 合并产品到现有款式（累加数量并记录历史）
   * @param existingProductId 现有产品 ID
   * @param newEntry 新的入库记录
   */
  async mergeProduct(
    existingProductId: string,
    newEntry: {
      quantity: number;
      location: string;
      detailImageUri: string;
      overviewImageUri: string;
      operatorId: string;
      operatorName: string;
    },
  ): Promise<void> {
    try {
      const products = await this.getAll();
      const index = products.findIndex((p) => p.id === existingProductId);
      
      if (index === -1) {
        throw new Error("产品不存在");
      }

      const existingProduct = products[index];
      const now = new Date().toISOString();

      // 创建历史记录条目
      const historyEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        operatorId: newEntry.operatorId,
        operatorName: newEntry.operatorName,
        quantity: newEntry.quantity,
        location: newEntry.location,
        detailImageUri: newEntry.detailImageUri,
        overviewImageUri: newEntry.overviewImageUri,
      };

      // 更新产品
      products[index] = {
        ...existingProduct,
        quantity: existingProduct.quantity + newEntry.quantity,
        updatedAt: now,
        // 保持原有的主图片和位置不变
        history: [...(existingProduct.history || []), historyEntry],
      };

      await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
    } catch (error) {
      console.error("Failed to merge product:", error);
      throw error;
    }
  },

  /**
   * 添加新产品（带历史记录）
   * @param product 产品信息
   */
  async addWithHistory(product: Omit<Product, "history">): Promise<void> {
    try {
      const now = new Date().toISOString();

      // 创建首次入库的历史记录
      const historyEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        operatorId: product.operatorId || "",
        operatorName: product.operatorName || "",
        quantity: product.quantity,
        location: product.storageLocation,
        detailImageUri: product.detailImageUri,
        overviewImageUri: product.overviewImageUri,
      };

      const productWithHistory: Product = {
        ...product,
        createdAt: now,
        updatedAt: now,
        history: [historyEntry],
      };

      await this.add(productWithHistory);
    } catch (error) {
      console.error("Failed to add product with history:", error);
      throw error;
    }
  },
};

/**
 * 应用设置存储工具
 */
export const SettingsStorage = {
  /**
   * 获取应用设置
   */
  async get(): Promise<AppSettings> {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      return data
        ? JSON.parse(data)
        : { lastSku: "", defaultLocation: "" };
    } catch (error) {
      console.error("Failed to load settings:", error);
      return { lastSku: "", defaultLocation: "" };
    }
  },

  /**
   * 更新应用设置
   */
  async update(updates: Partial<AppSettings>): Promise<void> {
    try {
      const settings = await this.get();
      const newSettings = { ...settings, ...updates };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (error) {
      console.error("Failed to update settings:", error);
      throw error;
    }
  },
};
