import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Product, InventoryHistory } from '@/types/product';

// 数据库 Schema 定义
interface FashionAccessoriesDB extends DBSchema {
  products: {
    key: string;
    value: Product;
    indexes: {
      'by-sku': string;
      'by-storageLocation': string;
      'by-isDeleted': boolean;
      'by-createdAt': string;
    };
  };
  inventory_history: {
    key: string;
    value: InventoryHistory;
    indexes: {
      'by-productId': string;
      'by-timestamp': string;
      'by-action': string;
    };
  };
}

// IndexedDB 存储类
class IndexedDBStorage {
  private db: IDBPDatabase<FashionAccessoriesDB> | null = null;
  private readonly DB_NAME = 'FashionAccessoriesDB';
  private readonly DB_VERSION = 1;
  private isInitializing = false;

  // 初始化数据库
  async init(): Promise<void> {
    if (this.db) return; // 已经初始化
    if (this.isInitializing) {
      // 等待初始化完成
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return;
    }

    this.isInitializing = true;
    try {
      this.db = await openDB<FashionAccessoriesDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          // 创建 products 表
          if (!db.objectStoreNames.contains('products')) {
            const productStore = db.createObjectStore('products', { keyPath: 'id' });
            productStore.createIndex('by-sku', 'sku', { unique: false });
            productStore.createIndex('by-storageLocation', 'storageLocation', { unique: false });
            productStore.createIndex('by-isDeleted', 'isDeleted', { unique: false });
            productStore.createIndex('by-createdAt', 'createdAt', { unique: false });
          }

          // 创建 inventory_history 表
          if (!db.objectStoreNames.contains('inventory_history')) {
            const historyStore = db.createObjectStore('inventory_history', { keyPath: 'id' });
            historyStore.createIndex('by-productId', 'productId', { unique: false });
            historyStore.createIndex('by-timestamp', 'timestamp', { unique: false });
            historyStore.createIndex('by-action', 'action', { unique: false });
          }
        },
      });
    } finally {
      this.isInitializing = false;
    }
  }

  // 确保数据库已初始化（带重连机制）
  private async ensureInit(): Promise<void> {
    // 检查数据库连接是否有效
    if (this.db) {
      try {
        // 尝试一个简单的操作来验证连接
        await this.db.count('products');
        return;
      } catch (error: any) {
        // 连接已关闭，需要重新连接
        console.warn('[IndexedDB] Connection lost, reconnecting...', error.message);
        this.db = null;
      }
    }
    await this.init();
  }

  // 带重试的数据库操作
  private async withRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.ensureInit();
        return await operation();
      } catch (error: any) {
        lastError = error;
        const isConnectionError = 
          error.message?.includes('database connection is closing') ||
          error.message?.includes('InvalidStateError') ||
          error.name === 'InvalidStateError';
        
        if (isConnectionError && i < maxRetries - 1) {
          console.warn(`[IndexedDB] Operation failed (attempt ${i + 1}/${maxRetries}), retrying...`);
          this.db = null; // 强制重新连接
          await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
          continue;
        }
        throw error;
      }
    }
    
    throw lastError || new Error('Operation failed after retries');
  }

  // ==================== 产品操作 ====================

  // 添加产品
  async addProduct(product: Product): Promise<void> {
    await this.withRetry(async () => {
      await this.db!.add('products', product);
    });
  }

  // 更新产品
  async updateProduct(product: Product): Promise<void> {
    await this.withRetry(async () => {
      await this.db!.put('products', product);
    });
  }

  // 删除产品（软删除）
  async deleteProduct(id: string): Promise<void> {
    await this.withRetry(async () => {
      const product = await this.db!.get('products', id);
      if (product) {
        const now = new Date().toISOString();
        product.isDeleted = true;
        product.deletedAt = now;
        product.updatedAt = now;
        await this.db!.put('products', product);
      }
    });
  }

  // 永久删除产品（从数据库中完全移除）
  async permanentDeleteProduct(id: string): Promise<void> {
    await this.withRetry(async () => {
      await this.db!.delete('products', id);
    });
  }

  // 恢复产品
  async restoreProduct(id: string): Promise<void> {
    await this.withRetry(async () => {
      const product = await this.db!.get('products', id);
      if (product) {
        product.isDeleted = false;
        product.deletedAt = undefined;
        product.updatedAt = new Date().toISOString();
        await this.db!.put('products', product);
      }
    });
  }

  // 获取单个产品
  async getProduct(id: string): Promise<Product | undefined> {
    return await this.withRetry(async () => {
      return await this.db!.get('products', id);
    });
  }

  // 获取所有活跃产品
  async getActiveProducts(): Promise<Product[]> {
    return await this.withRetry(async () => {
      // 使用过滤方式而非索引查询，因为布尔索引在某些浏览器中可能不稳定
      const allProducts = await this.db!.getAll('products');
      return allProducts.filter(p => !p.isDeleted);
    });
  }

  // 获取所有已删除产品
  async getDeletedProducts(): Promise<Product[]> {
    return await this.withRetry(async () => {
      // 使用过滤方式而非索引查询
      const allProducts = await this.db!.getAll('products');
      return allProducts.filter(p => p.isDeleted === true);
    });
  }

  // 根据 SKU 查询产品
  async getProductsBySku(sku: string): Promise<Product[]> {
    return await this.withRetry(async () => {
      const index = this.db!.transaction('products').store.index('by-sku');
      return await index.getAll(sku);
    });
  }

  // 根据位置查询产品
  async getProductsByLocation(location: string): Promise<Product[]> {
    return await this.withRetry(async () => {
      const index = this.db!.transaction('products').store.index('by-storageLocation');
      return await index.getAll(location);
    });
  }

  // 获取所有产品（包括已删除）
  async getAllProducts(): Promise<Product[]> {
    return await this.withRetry(async () => {
      return await this.db!.getAll('products');
    });
  }

  // 搜索产品（SKU 或位置）
  async searchProducts(query: string): Promise<Product[]> {
    return await this.withRetry(async () => {
      const allProducts = await this.db!.getAll('products');
      const activeProducts = allProducts.filter(p => !p.isDeleted);
      const lowerQuery = query.toLowerCase();
      
      return activeProducts.filter(product => 
        product.sku.toLowerCase().includes(lowerQuery) ||
        product.storageLocation.toLowerCase().includes(lowerQuery)
      );
    });
  }

  // ==================== 历史记录操作 ====================

  // 添加历史记录
  async addHistory(history: InventoryHistory): Promise<void> {
    await this.withRetry(async () => {
      await this.db!.add('inventory_history', history);
    });
  }

  // 获取产品的历史记录
  async getProductHistory(productId: string): Promise<InventoryHistory[]> {
    return await this.withRetry(async () => {
      const index = this.db!.transaction('inventory_history').store.index('by-productId');
      return await index.getAll(productId);
    });
  }

  // 获取所有历史记录
  async getAllHistory(): Promise<InventoryHistory[]> {
    return await this.withRetry(async () => {
      return await this.db!.getAll('inventory_history');
    });
  }

  // ==================== 导出/导入操作 ====================

  // 导出所有数据为 JSON
  async exportAllData(): Promise<string> {
    return await this.withRetry(async () => {
      const products = await this.db!.getAll('products');
      const history = await this.db!.getAll('inventory_history');
      
      const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        productsCount: products.length,
        historyCount: history.length,
        products,
        history,
      };
      
      return JSON.stringify(data, null, 2);
    });
  }

  // 导入数据
  async importData(jsonString: string): Promise<void> {
    await this.withRetry(async () => {
      const data = JSON.parse(jsonString);
      
      // 验证数据格式
      if (!data.version || !data.products || !data.history) {
        throw new Error('Invalid data format');
      }
      
      // 清空现有数据
      const txClear = this.db!.transaction(['products', 'inventory_history'], 'readwrite');
      await txClear.objectStore('products').clear();
      await txClear.objectStore('inventory_history').clear();
      await txClear.done;
      
      // 导入产品
      const tx1 = this.db!.transaction('products', 'readwrite');
      for (const product of data.products) {
        await tx1.store.add(product);
      }
      await tx1.done;
      
      // 导入历史记录
      const tx2 = this.db!.transaction('inventory_history', 'readwrite');
      for (const history of data.history) {
        await tx2.store.add(history);
      }
      await tx2.done;
    });
  }

  // 清空所有数据
  async clearAllData(): Promise<void> {
    await this.withRetry(async () => {
      const tx = this.db!.transaction(['products', 'inventory_history'], 'readwrite');
      await tx.objectStore('products').clear();
      await tx.objectStore('inventory_history').clear();
      await tx.done;
    });
  }

  // ==================== 统计操作 ====================

  // 获取产品总数
  async getProductCount(): Promise<number> {
    return await this.withRetry(async () => {
      return await this.db!.count('products');
    });
  }

  // 获取活跃产品总数
  async getActiveProductCount(): Promise<number> {
    return await this.withRetry(async () => {
      const allProducts = await this.db!.getAll('products');
      return allProducts.filter(p => !p.isDeleted).length;
    });
  }

  // 获取已删除产品总数
  async getDeletedProductCount(): Promise<number> {
    return await this.withRetry(async () => {
      const allProducts = await this.db!.getAll('products');
      return allProducts.filter(p => p.isDeleted === true).length;
    });
  }

  // 获取历史记录总数
  async getHistoryCount(): Promise<number> {
    return await this.withRetry(async () => {
      return await this.db!.count('inventory_history');
    });
  }
}

// 导出单例
export const indexedDBStorage = new IndexedDBStorage();
