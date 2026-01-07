import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { indexedDBStorage } from './indexeddb-storage';
import type { Product, AppSettings, InventoryHistory } from '@/types/product';

/**
 * 统一的存储适配器
 * Web 平台使用 IndexedDB，原生平台使用 AsyncStorage
 */

const PRODUCTS_KEY = 'products';
const SETTINGS_KEY = 'settings';

// ==================== 产品存储适配器 ====================

export const ProductStorageAdapter = {
  /**
   * 获取所有产品记录（包含已删除的）
   */
  async getAll(): Promise<Product[]> {
    if (Platform.OS === 'web') {
      return await indexedDBStorage.getAllProducts();
    } else {
      try {
        const data = await AsyncStorage.getItem(PRODUCTS_KEY);
        return data ? JSON.parse(data) : [];
      } catch (error) {
        console.error('Failed to load products:', error);
        return [];
      }
    }
  },

  /**
   * 获取活跃产品（未删除的）
   */
  async getActive(): Promise<Product[]> {
    if (Platform.OS === 'web') {
      return await indexedDBStorage.getActiveProducts();
    } else {
      try {
        const products = await this.getAll();
        return products.filter((p) => !p.isDeleted);
      } catch (error) {
        console.error('Failed to load active products:', error);
        return [];
      }
    }
  },

  /**
   * 获取回收站产品（已删除的）
   */
  async getDeleted(): Promise<Product[]> {
    if (Platform.OS === 'web') {
      return await indexedDBStorage.getDeletedProducts();
    } else {
      try {
        const products = await this.getAll();
        return products.filter((p) => p.isDeleted);
      } catch (error) {
        console.error('Failed to load deleted products:', error);
        return [];
      }
    }
  },

  /**
   * 保存新产品记录
   */
  async add(product: Product): Promise<void> {
    if (Platform.OS === 'web') {
      await indexedDBStorage.addProduct(product);
    } else {
      try {
        const products = await this.getAll();
        products.unshift(product); // 新记录添加到开头
        await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
      } catch (error) {
        console.error('Failed to save product:', error);
        throw error;
      }
    }
  },

  /**
   * 根据 ID 获取产品
   */
  async getById(id: string): Promise<Product | null> {
    if (Platform.OS === 'web') {
      const product = await indexedDBStorage.getProduct(id);
      return product || null;
    } else {
      try {
        const products = await this.getAll();
        return products.find((p) => p.id === id) || null;
      } catch (error) {
        console.error('Failed to get product:', error);
        return null;
      }
    }
  },

  /**
   * 更新产品记录
   */
  async update(id: string, updates: Partial<Product>): Promise<void> {
    if (Platform.OS === 'web') {
      const product = await indexedDBStorage.getProduct(id);
      if (product) {
        const updatedProduct = { ...product, ...updates, updatedAt: new Date().toISOString() };
        await indexedDBStorage.updateProduct(updatedProduct);
      }
    } else {
      try {
        const products = await this.getAll();
        const index = products.findIndex((p) => p.id === id);
        if (index !== -1) {
          products[index] = { ...products[index], ...updates };
          await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
        }
      } catch (error) {
        console.error('Failed to update product:', error);
        throw error;
      }
    }
  },

  /**
   * 软删除产品记录（移至回收站）
   */
  async softDelete(id: string): Promise<void> {
    if (Platform.OS === 'web') {
      await indexedDBStorage.deleteProduct(id);
    } else {
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
        console.error('Failed to soft delete product:', error);
        throw error;
      }
    }
  },

  /**
   * 恢复已删除的产品
   */
  async restore(id: string): Promise<void> {
    if (Platform.OS === 'web') {
      await indexedDBStorage.restoreProduct(id);
    } else {
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
        console.error('Failed to restore product:', error);
        throw error;
      }
    }
  },

  /**
   * 永久删除产品记录
   */
  async permanentDelete(id: string): Promise<void> {
    if (Platform.OS === 'web') {
      // IndexedDB 中永久删除记录
      await indexedDBStorage.permanentDeleteProduct(id);
    } else {
      try {
        const products = await this.getAll();
        const filtered = products.filter((p) => p.id !== id);
        await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(filtered));
      } catch (error) {
        console.error('Failed to permanently delete product:', error);
        throw error;
      }
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
        if (Platform.OS === 'web') {
          // 对于 IndexedDB，需要逐个删除
          const deletedProducts = await indexedDBStorage.getDeletedProducts();
          for (const product of deletedProducts) {
            if (product.deletedAt) {
              const deletedDate = new Date(product.deletedAt);
              if (deletedDate < ninetyDaysAgo) {
                // TODO: 实现永久删除
              }
            }
          }
        } else {
          await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(filtered));
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup old deleted products:', error);
      return 0;
    }
  },

  /**
   * 替换所有产品数据（用于从云端同步）
   */
  async replaceAll(products: Product[]): Promise<void> {
    if (Platform.OS === 'web') {
      await indexedDBStorage.clearAllData();
      for (const product of products) {
        await indexedDBStorage.addProduct(product);
      }
    } else {
      try {
        await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
      } catch (error) {
        console.error('Failed to replace all products:', error);
        throw error;
      }
    }
  },

  /**
   * 按 SKU 搜索产品（仅搜索活跃产品）
   */
  async searchBySku(sku: string): Promise<Product[]> {
    if (Platform.OS === 'web') {
      return await indexedDBStorage.searchProducts(sku);
    } else {
      try {
        const products = await this.getActive();
        const lowerSku = sku.toLowerCase();
        return products.filter((p) => p.sku.toLowerCase().includes(lowerSku));
      } catch (error) {
        console.error('Failed to search products:', error);
        return [];
      }
    }
  },

  /**
   * 合并产品到现有款式（累加数量并记录历史）
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
    }
  ): Promise<void> {
    if (Platform.OS === 'web') {
      const product = await indexedDBStorage.getProduct(existingProductId);
      if (!product) {
        throw new Error('产品不存在');
      }

      const now = new Date().toISOString();

      // 创建历史记录条目
      const historyEntry: InventoryHistory = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        productId: existingProductId,
        timestamp: now,
        operatorId: parseInt(newEntry.operatorId),
        operatorName: newEntry.operatorName,
        quantity: newEntry.quantity,
        location: newEntry.location,
        detailImageUri: newEntry.detailImageUri,
        overviewImageUri: newEntry.overviewImageUri,
      };

      // 添加历史记录
      await indexedDBStorage.addHistory(historyEntry);

      // 更新产品数量
      await indexedDBStorage.updateProduct({
        ...product,
        quantity: product.quantity + newEntry.quantity,
        updatedAt: now,
      });
    } else {
      try {
        const products = await this.getAll();
        const index = products.findIndex((p) => p.id === existingProductId);

        if (index === -1) {
          throw new Error('产品不存在');
        }

        const existingProduct = products[index];
        const now = new Date().toISOString();

        // 创建历史记录条目
        const historyEntry: InventoryHistory = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: now,
          operatorId: parseInt(newEntry.operatorId),
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
          history: [...(existingProduct.history || []), historyEntry],
        };

        await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
      } catch (error) {
        console.error('Failed to merge product:', error);
        throw error;
      }
    }
  },

  /**
   * 添加新产品（带历史记录）
   */
  async addWithHistory(product: Omit<Product, 'history'>): Promise<void> {
    const now = new Date().toISOString();

    if (Platform.OS === 'web') {
      // 创建产品
      const productWithHistory: Product = {
        ...product,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        history: [],
      };

      await indexedDBStorage.addProduct(productWithHistory);

      // 创建首次入库的历史记录
      const historyEntry: InventoryHistory = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        productId: product.id,
        timestamp: now,
        operatorId: product.operatorId || 1,
        operatorName: product.operatorName || '',
        quantity: product.quantity,
        location: product.storageLocation,
        detailImageUri: product.detailImageUri,
        overviewImageUri: product.overviewImageUri,
      };

      await indexedDBStorage.addHistory(historyEntry);
    } else {
      try {
        // 创建首次入库的历史记录
        const historyEntry = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: now,
          operatorId: product.operatorId || 1,
          operatorName: product.operatorName || '',
          quantity: product.quantity,
          location: product.storageLocation,
          detailImageUri: product.detailImageUri,
          overviewImageUri: product.overviewImageUri,
        };

        const productWithHistory: Product = {
          ...product,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
          history: [historyEntry],
        };

        await this.add(productWithHistory);
      } catch (error) {
        console.error('Failed to add product with history:', error);
        throw error;
      }
    }
  },

  /**
   * 获取产品的历史记录
   */
  async getHistory(productId: string): Promise<InventoryHistory[]> {
    if (Platform.OS === 'web') {
      return await indexedDBStorage.getProductHistory(productId);
    } else {
      // AsyncStorage 中历史记录存储在产品对象中
      const product = await this.getById(productId);
      return product?.history || [];
    }
  },

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    totalProducts: number;
    activeProducts: number;
    deletedProducts: number;
  }> {
    if (Platform.OS === 'web') {
      const [totalProducts, activeProducts, deletedProducts] = await Promise.all([
        indexedDBStorage.getProductCount(),
        indexedDBStorage.getActiveProductCount(),
        indexedDBStorage.getDeletedProductCount(),
      ]);
      return { totalProducts, activeProducts, deletedProducts };
    } else {
      const products = await this.getAll();
      const activeProducts = products.filter((p) => !p.isDeleted).length;
      const deletedProducts = products.filter((p) => p.isDeleted).length;
      return {
        totalProducts: products.length,
        activeProducts,
        deletedProducts,
      };
    }
  },
};

// ==================== 设置存储适配器 ====================

export const SettingsStorageAdapter = {
  /**
   * 获取应用设置
   */
  async get(): Promise<AppSettings> {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : { lastSku: '', defaultLocation: '' };
    } catch (error) {
      console.error('Failed to load settings:', error);
      return { lastSku: '', defaultLocation: '' };
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
      console.error('Failed to update settings:', error);
      throw error;
    }
  },
};

// ==================== 导出/导入功能 ====================

export const BackupAdapter = {
  /**
   * 导出所有数据为 JSON 字符串
   */
  async exportData(): Promise<string> {
    if (Platform.OS === 'web') {
      return await indexedDBStorage.exportAllData();
    } else {
      const products = await ProductStorageAdapter.getAll();
      const settings = await SettingsStorageAdapter.get();
      
      // 导出 Box 数据
      let boxes: any[] = [];
      try {
        const { getAllBoxes } = await import('./box-storage');
        boxes = await getAllBoxes();
      } catch (error) {
        console.warn('[BackupAdapter] Failed to export boxes:', error);
      }

      const data = {
        version: 2, // 升级版本号，表示包含 Box 数据
        exportDate: new Date().toISOString(),
        productsCount: products.length,
        boxesCount: boxes.length,
        products,
        settings,
        boxes,
      };

      return JSON.stringify(data, null, 2);
    }
  },

  /**
   * 导入数据
   */
  async importData(jsonString: string): Promise<void> {
    if (Platform.OS === 'web') {
      await indexedDBStorage.importData(jsonString);
    } else {
      const data = JSON.parse(jsonString);

      // 验证数据格式
      if (!data.version || !data.products) {
        throw new Error('Invalid data format');
      }

      // 导入产品
      await ProductStorageAdapter.replaceAll(data.products);

      // 导入设置（如果有）
      if (data.settings) {
        await SettingsStorageAdapter.update(data.settings);
      }
      
      // 导入 Box 数据（如果有，版本 2+）
      if (data.boxes && data.boxes.length > 0) {
        try {
          const { importBoxes } = await import('./box-storage');
          await importBoxes(data.boxes);
          console.log(`[BackupAdapter] Imported ${data.boxes.length} boxes`);
        } catch (error) {
          console.warn('[BackupAdapter] Failed to import boxes:', error);
        }
      }
    }
  },

  /**
   * 清空所有数据
   */
  async clearAllData(): Promise<void> {
    if (Platform.OS === 'web') {
      await indexedDBStorage.clearAllData();
    } else {
      await AsyncStorage.removeItem(PRODUCTS_KEY);
    }
  },
};
