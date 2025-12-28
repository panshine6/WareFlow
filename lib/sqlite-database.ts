/**
 * SQLite 数据库管理
 * 负责数据库初始化、表创建、索引创建
 */
import * as SQLite from 'expo-sqlite';

export class SQLiteDatabase {
  private static instance: SQLiteDatabase;
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): SQLiteDatabase {
    if (!SQLiteDatabase.instance) {
      SQLiteDatabase.instance = new SQLiteDatabase();
    }
    return SQLiteDatabase.instance;
  }

  /**
   * 初始化数据库
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('[SQLiteDatabase] Initializing database...');
      
      // 打开数据库
      this.db = await SQLite.openDatabaseAsync('inventory.db');
      
      // 创建表结构
      await this.createTables();
      
      // 创建索引
      await this.createIndexes();
      
      this.isInitialized = true;
      console.log('[SQLiteDatabase] Database initialized successfully');
    } catch (error) {
      console.error('[SQLiteDatabase] Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * 创建表结构
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // 创建 products 表
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        storageLocation TEXT NOT NULL,
        detailImageUri TEXT NOT NULL,
        overviewImageUri TEXT,
        operatorId INTEGER NOT NULL,
        operatorName TEXT NOT NULL,
        isDeleted INTEGER NOT NULL DEFAULT 0,
        deletedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    // 创建 inventory_history 表
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS inventory_history (
        id TEXT PRIMARY KEY,
        productId TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        operatorId INTEGER NOT NULL,
        operatorName TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        location TEXT NOT NULL,
        detailImageUri TEXT NOT NULL,
        overviewImageUri TEXT,
        notes TEXT
      );
    `);

    // 创建 sync_status 表
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lastSyncTime TEXT NOT NULL,
        syncType TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT
      );
    `);

    console.log('[SQLiteDatabase] Tables created successfully');
  }

  /**
   * 创建索引
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // products 表索引
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
      CREATE INDEX IF NOT EXISTS idx_products_isDeleted ON products(isDeleted);
      CREATE INDEX IF NOT EXISTS idx_products_createdAt ON products(createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_products_sku_deleted ON products(sku, isDeleted);
    `);

    // inventory_history 表索引
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_history_productId ON inventory_history(productId);
      CREATE INDEX IF NOT EXISTS idx_history_timestamp ON inventory_history(timestamp DESC);
    `);

    console.log('[SQLiteDatabase] Indexes created successfully');
  }

  /**
   * 获取数据库实例
   */
  public getDatabase(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * 关闭数据库
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      this.isInitialized = false;
      console.log('[SQLiteDatabase] Database closed');
    }
  }

  /**
   * 清空所有数据（用于测试）
   */
  public async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execAsync(`
      DELETE FROM inventory_history;
      DELETE FROM products;
      DELETE FROM sync_status;
    `);

    console.log('[SQLiteDatabase] All data cleared');
  }
}
