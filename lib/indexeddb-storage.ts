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

// 连接错误类型检测
function isConnectionError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  const errorName = error.name || '';
  
  return (
    // 连接关闭错误
    errorMessage.includes('database connection is closing') ||
    errorMessage.includes('connection is closing') ||
    errorMessage.includes('database is closing') ||
    // InvalidStateError - 数据库状态无效
    errorMessage.includes('invalidstateerror') ||
    errorName === 'InvalidStateError' ||
    // 事务相关错误
    errorMessage.includes('transaction') && errorMessage.includes('finished') ||
    errorMessage.includes('transaction is not active') ||
    // 数据库未打开
    errorMessage.includes('database not open') ||
    errorMessage.includes('not open') ||
    // AbortError - 操作被中止
    errorName === 'AbortError' ||
    // UnknownError - 未知错误（通常是连接问题）
    errorName === 'UnknownError' ||
    // iOS Safari 特有的错误
    errorMessage.includes('connection to indexed database server lost')
  );
}

// 格式化用户友好的错误消息
function formatUserFriendlyError(error: any, operation: string): string {
  if (isConnectionError(error)) {
    return `数据库连接暂时中断，正在自动重试...如果问题持续，请刷新页面后重试`;
  }
  
  if (error.name === 'QuotaExceededError') {
    return `存储空间不足，请清理设备存储后重试`;
  }
  
  if (error.name === 'ConstraintError') {
    return `数据冲突：${operation}失败，该记录可能已存在`;
  }
  
  return error.message || `${operation}失败，请重试`;
}

// IndexedDB 存储类
class IndexedDBStorage {
  private db: IDBPDatabase<FashionAccessoriesDB> | null = null;
  private readonly DB_NAME = 'FashionAccessoriesDB';
  private readonly DB_VERSION = 1;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private lastSuccessfulOperation: number = Date.now();
  private connectionCheckInterval: number | null = null;

  // 初始化数据库
  async init(): Promise<void> {
    // 如果已经有有效连接，直接返回
    if (this.db && !this.isConnectionStale()) {
      return;
    }
    
    // 如果正在初始化，等待初始化完成
    if (this.isInitializing && this.initPromise) {
      await this.initPromise;
      return;
    }

    this.isInitializing = true;
    this.initPromise = this.doInit();
    
    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
      this.initPromise = null;
    }
  }

  private async doInit(): Promise<void> {
    try {
      // 如果有旧连接，先关闭
      if (this.db) {
        try {
          this.db.close();
        } catch (e) {
          // 忽略关闭错误
        }
        this.db = null;
      }

      console.log('[IndexedDB] Opening database connection...');
      
      // 检查 IndexedDB 是否可用
      if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB 不可用');
      }
      
      this.db = await openDB<FashionAccessoriesDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
          console.log(`[IndexedDB] Upgrading database from v${oldVersion} to v${newVersion}`);
          
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
        blocked() {
          console.warn('[IndexedDB] Database upgrade blocked by another connection');
        },
        blocking() {
          console.warn('[IndexedDB] This connection is blocking a database upgrade');
        },
        terminated() {
          console.warn('[IndexedDB] Database connection was terminated unexpectedly');
        },
      });

      this.lastSuccessfulOperation = Date.now();
      console.log('[IndexedDB] Database connection established successfully');
      
      // 启动连接健康检查（每30秒）
      this.startConnectionHealthCheck();
      
    } catch (error: any) {
      console.error('[IndexedDB] Failed to open database:', error);
      this.db = null;
      throw error;
    }
  }

  // 检查连接是否过期（超过5分钟没有成功操作）
  private isConnectionStale(): boolean {
    const STALE_THRESHOLD = 5 * 60 * 1000; // 5 分钟
    return Date.now() - this.lastSuccessfulOperation > STALE_THRESHOLD;
  }

  // 启动连接健康检查
  private startConnectionHealthCheck(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
    
    // 每30秒检查一次连接
    this.connectionCheckInterval = setInterval(async () => {
      if (this.db) {
        try {
          await this.db.count('products');
          this.lastSuccessfulOperation = Date.now();
        } catch (error) {
          console.warn('[IndexedDB] Health check failed, connection may be stale');
          // 不主动断开，等下次操作时重连
        }
      }
    }, 30000) as unknown as number;
  }

  // 确保数据库已初始化（带重连机制）
  private async ensureInit(): Promise<void> {
    // 检查数据库连接是否有效
    if (this.db) {
      try {
        // 尝试一个简单的操作来验证连接
        await this.db.count('products');
        this.lastSuccessfulOperation = Date.now();
        return;
      } catch (error: any) {
        // 连接已关闭，需要重新连接
        console.warn('[IndexedDB] Connection lost, will reconnect...', error.message);
        this.db = null;
      }
    }
    await this.init();
  }

  // 带重试的数据库操作（增强版）
  private async withRetry<T>(
    operation: () => Promise<T>, 
    operationName: string = 'operation',
    maxRetries: number = 5
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.ensureInit();
        const result = await operation();
        this.lastSuccessfulOperation = Date.now();
        return result;
      } catch (error: any) {
        lastError = error;
        
        if (isConnectionError(error)) {
          console.warn(`[IndexedDB] ${operationName} failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
          
          if (attempt < maxRetries) {
            // 强制重新连接
            this.db = null;
            // 指数退避：100ms, 200ms, 400ms, 800ms, 1600ms
            const delay = Math.min(100 * Math.pow(2, attempt - 1), 2000);
            console.log(`[IndexedDB] Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // 非连接错误或已达到最大重试次数
        throw error;
      }
    }
    
    // 所有重试都失败了
    const userMessage = formatUserFriendlyError(lastError, operationName);
    const enhancedError = new Error(userMessage);
    (enhancedError as any).originalError = lastError;
    throw enhancedError;
  }

  // ==================== 产品操作 ====================

  // 添加产品
  async addProduct(product: Product): Promise<void> {
    await this.withRetry(async () => {
      await this.db!.add('products', product);
    }, '添加产品');
  }

  // 更新产品
  async updateProduct(product: Product): Promise<void> {
    await this.withRetry(async () => {
      await this.db!.put('products', product);
    }, '更新产品');
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
    }, '删除产品');
  }

  // 永久删除产品（从数据库中完全移除）
  async permanentDeleteProduct(id: string): Promise<void> {
    await this.withRetry(async () => {
      await this.db!.delete('products', id);
    }, '永久删除产品');
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
    }, '恢复产品');
  }

  // 获取单个产品
  async getProduct(id: string): Promise<Product | undefined> {
    return await this.withRetry(async () => {
      return await this.db!.get('products', id);
    }, '获取产品');
  }

  // 获取所有活跃产品
  async getActiveProducts(): Promise<Product[]> {
    return await this.withRetry(async () => {
      // 使用过滤方式而非索引查询，因为布尔索引在某些浏览器中可能不稳定
      const allProducts = await this.db!.getAll('products');
      return allProducts.filter(p => !p.isDeleted);
    }, '获取活跃产品');
  }

  // 获取所有已删除产品
  async getDeletedProducts(): Promise<Product[]> {
    return await this.withRetry(async () => {
      // 使用过滤方式而非索引查询
      const allProducts = await this.db!.getAll('products');
      return allProducts.filter(p => p.isDeleted === true);
    }, '获取已删除产品');
  }

  // 根据 SKU 查询产品
  async getProductsBySku(sku: string): Promise<Product[]> {
    return await this.withRetry(async () => {
      const index = this.db!.transaction('products').store.index('by-sku');
      return await index.getAll(sku);
    }, '按SKU查询产品');
  }

  // 根据位置查询产品
  async getProductsByLocation(location: string): Promise<Product[]> {
    return await this.withRetry(async () => {
      const index = this.db!.transaction('products').store.index('by-storageLocation');
      return await index.getAll(location);
    }, '按位置查询产品');
  }

  // 获取所有产品（包括已删除）
  async getAllProducts(): Promise<Product[]> {
    return await this.withRetry(async () => {
      return await this.db!.getAll('products');
    }, '获取所有产品');
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
    }, '搜索产品');
  }

  // ==================== 历史记录操作 ====================

  // 添加历史记录
  async addHistory(history: InventoryHistory): Promise<void> {
    await this.withRetry(async () => {
      await this.db!.add('inventory_history', history);
    }, '添加历史记录');
  }

  // 获取产品的历史记录
  async getProductHistory(productId: string): Promise<InventoryHistory[]> {
    return await this.withRetry(async () => {
      const index = this.db!.transaction('inventory_history').store.index('by-productId');
      return await index.getAll(productId);
    }, '获取产品历史');
  }

  // 获取所有历史记录
  async getAllHistory(): Promise<InventoryHistory[]> {
    return await this.withRetry(async () => {
      return await this.db!.getAll('inventory_history');
    }, '获取所有历史');
  }

  // ==================== 导出/导入操作 ====================

  // 导出所有数据为 JSON
  async exportAllData(): Promise<string> {
    return await this.withRetry(async () => {
      const products = await this.db!.getAll('products');
      const history = await this.db!.getAll('inventory_history');
      
      // 导出 Box 数据（从独立的 IndexedDB 数据库）
      let boxes: any[] = [];
      try {
        const { getAllBoxes } = await import('./box-storage');
        boxes = await getAllBoxes();
      } catch (error) {
        console.warn('[IndexedDB] Failed to export boxes:', error);
      }
      
      const data = {
        version: 2, // 升级版本号，表示包含 Box 数据
        exportDate: new Date().toISOString(),
        productsCount: products.length,
        historyCount: history.length,
        boxesCount: boxes.length,
        products,
        history,
        boxes,
      };
      
      return JSON.stringify(data, null, 2);
    }, '导出数据');
  }

  // 导入数据
  async importData(jsonString: string): Promise<void> {
    await this.withRetry(async () => {
      const data = JSON.parse(jsonString);
      
      // 验证数据格式（兼容旧版本和新版本）
      if (!data.version || !data.products) {
        throw new Error('Invalid data format');
      }
      
      // 清空现有数据
      const txClear = this.db!.transaction(['products', 'inventory_history'], 'readwrite');
      await txClear.objectStore('products').clear();
      await txClear.objectStore('inventory_history').clear();
      await txClear.done;
      
      // 导入产品（分批处理，避免大事务超时）
      const BATCH_SIZE = 50;
      for (let i = 0; i < data.products.length; i += BATCH_SIZE) {
        const batch = data.products.slice(i, i + BATCH_SIZE);
        const tx = this.db!.transaction('products', 'readwrite');
        for (const product of batch) {
          await tx.store.add(product);
        }
        await tx.done;
      }
      
      // 导入历史记录（如果有）
      if (data.history && data.history.length > 0) {
        for (let i = 0; i < data.history.length; i += BATCH_SIZE) {
          const batch = data.history.slice(i, i + BATCH_SIZE);
          const tx = this.db!.transaction('inventory_history', 'readwrite');
          for (const history of batch) {
            await tx.store.add(history);
          }
          await tx.done;
        }
      }
      
      // 导入 Box 数据（如果有，版本 2+）
      if (data.boxes && data.boxes.length > 0) {
        try {
          const { importBoxes } = await import('./box-storage');
          await importBoxes(data.boxes);
          console.log(`[IndexedDB] Imported ${data.boxes.length} boxes`);
        } catch (error) {
          console.warn('[IndexedDB] Failed to import boxes:', error);
        }
      }
    }, '导入数据');
  }

  // 清空所有数据
  async clearAllData(): Promise<void> {
    await this.withRetry(async () => {
      const tx = this.db!.transaction(['products', 'inventory_history'], 'readwrite');
      await tx.objectStore('products').clear();
      await tx.objectStore('inventory_history').clear();
      await tx.done;
    }, '清空数据');
  }

  // ==================== 统计操作 ====================

  // 获取产品总数
  async getProductCount(): Promise<number> {
    return await this.withRetry(async () => {
      return await this.db!.count('products');
    }, '获取产品数量');
  }

  // 获取活跃产品总数
  async getActiveProductCount(): Promise<number> {
    return await this.withRetry(async () => {
      const allProducts = await this.db!.getAll('products');
      return allProducts.filter(p => !p.isDeleted).length;
    }, '获取活跃产品数量');
  }

  // 获取已删除产品总数
  async getDeletedProductCount(): Promise<number> {
    return await this.withRetry(async () => {
      const allProducts = await this.db!.getAll('products');
      return allProducts.filter(p => p.isDeleted === true).length;
    }, '获取已删除产品数量');
  }

  // 获取历史记录总数
  async getHistoryCount(): Promise<number> {
    return await this.withRetry(async () => {
      return await this.db!.count('inventory_history');
    }, '获取历史记录数量');
  }

  // ==================== 诊断工具 ====================

  // 获取数据库连接状态
  getConnectionStatus(): { connected: boolean; lastOperation: number; stale: boolean } {
    return {
      connected: this.db !== null,
      lastOperation: this.lastSuccessfulOperation,
      stale: this.isConnectionStale(),
    };
  }

  // 强制重新连接
  async forceReconnect(): Promise<void> {
    console.log('[IndexedDB] Force reconnecting...');
    this.db = null;
    await this.init();
  }

  // 获取存储使用情况（使用 Storage API）
  async getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
        };
      } catch (error) {
        console.warn('[IndexedDB] Failed to get storage estimate:', error);
      }
    }
    return null;
  }
}

// 导出单例
export const indexedDBStorage = new IndexedDBStorage();
