/**
 * 产品数据访问层（Repository）
 * 负责所有产品相关的数据库操作
 */
import * as SQLite from 'expo-sqlite';
import { SQLiteDatabase } from './sqlite-database';
import type { Product } from '@/types/product';

export class ProductRepository {
  private db: SQLite.SQLiteDatabase;

  constructor() {
    this.db = SQLiteDatabase.getInstance().getDatabase();
  }

  /**
   * 创建产品
   */
  async create(product: Omit<Product, 'createdAt' | 'updatedAt'>): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      await this.db.runAsync(
        `INSERT INTO products (
          id, sku, quantity, storageLocation, detailImageUri, overviewImageUri,
          operatorId, operatorName, isDeleted, deletedAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id,
          product.sku,
          product.quantity,
          product.storageLocation,
          product.detailImageUri,
          product.overviewImageUri || null,
          product.operatorId || 0,
          product.operatorName || '',
          0, // isDeleted
          null, // deletedAt
          now, // createdAt
          now, // updatedAt
        ]
      );

      console.log('[ProductRepository] Product created:', product.id);
    } catch (error) {
      console.error('[ProductRepository] Failed to create product:', error);
      throw error;
    }
  }

  /**
   * 删除全景图（释放空间）
   */
  async deleteOverviewImage(productId: string): Promise<void> {
    try {
      await this.db.runAsync(
        'UPDATE products SET overviewImageUri = NULL, updatedAt = ? WHERE id = ?',
        [new Date().toISOString(), productId]
      );

      console.log('[ProductRepository] Overview image deleted for product:', productId);
    } catch (error) {
      console.error('[ProductRepository] Failed to delete overview image:', error);
      throw error;
    }
  }

  /**
   * 获取所有活跃产品
   */
  async getActive(): Promise<Product[]> {
    try {
      const result = await this.db.getAllAsync<Product>(
        'SELECT * FROM products WHERE isDeleted = 0 ORDER BY createdAt DESC'
      );

      console.log('[ProductRepository] Retrieved', result.length, 'active products');
      return result;
    } catch (error) {
      console.error('[ProductRepository] Failed to get active products:', error);
      return [];
    }
  }

  /**
   * 获取所有产品（包括已删除）
   */
  async getAll(): Promise<Product[]> {
    try {
      const result = await this.db.getAllAsync<Product>(
        'SELECT * FROM products ORDER BY createdAt DESC'
      );

      console.log('[ProductRepository] Retrieved', result.length, 'products');
      return result;
    } catch (error) {
      console.error('[ProductRepository] Failed to get all products:', error);
      return [];
    }
  }

  /**
   * 获取已删除产品
   */
  async getDeleted(): Promise<Product[]> {
    try {
      const result = await this.db.getAllAsync<Product>(
        'SELECT * FROM products WHERE isDeleted = 1 ORDER BY deletedAt DESC'
      );

      console.log('[ProductRepository] Retrieved', result.length, 'deleted products');
      return result;
    } catch (error) {
      console.error('[ProductRepository] Failed to get deleted products:', error);
      return [];
    }
  }

  /**
   * 根据 ID 获取产品
   */
  async getById(id: string): Promise<Product | null> {
    try {
      const result = await this.db.getFirstAsync<Product>(
        'SELECT * FROM products WHERE id = ?',
        [id]
      );

      return result || null;
    } catch (error) {
      console.error('[ProductRepository] Failed to get product by ID:', error);
      return null;
    }
  }

  /**
   * 按 SKU 搜索
   */
  async searchBySku(sku: string): Promise<Product[]> {
    try {
      const result = await this.db.getAllAsync<Product>(
        'SELECT * FROM products WHERE sku LIKE ? AND isDeleted = 0 ORDER BY createdAt DESC',
        [`%${sku}%`]
      );

      console.log('[ProductRepository] Found', result.length, 'products for SKU:', sku);
      return result;
    } catch (error) {
      console.error('[ProductRepository] Failed to search by SKU:', error);
      return [];
    }
  }

  /**
   * 更新产品
   */
  async update(id: string, updates: Partial<Product>): Promise<void> {
    try {
      const fields: string[] = [];
      const values: any[] = [];

      // 构建 SET 子句
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'createdAt') {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      });

      // 添加 updatedAt
      fields.push('updatedAt = ?');
      values.push(new Date().toISOString());

      // 添加 WHERE 条件
      values.push(id);

      await this.db.runAsync(
        `UPDATE products SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      console.log('[ProductRepository] Product updated:', id);
    } catch (error) {
      console.error('[ProductRepository] Failed to update product:', error);
      throw error;
    }
  }

  /**
   * 软删除产品
   */
  async softDelete(id: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      await this.db.runAsync(
        'UPDATE products SET isDeleted = 1, deletedAt = ?, updatedAt = ? WHERE id = ?',
        [now, now, id]
      );

      console.log('[ProductRepository] Product soft deleted:', id);
    } catch (error) {
      console.error('[ProductRepository] Failed to soft delete product:', error);
      throw error;
    }
  }

  /**
   * 恢复已删除产品
   */
  async restore(id: string): Promise<void> {
    try {
      await this.db.runAsync(
        'UPDATE products SET isDeleted = 0, deletedAt = NULL, updatedAt = ? WHERE id = ?',
        [new Date().toISOString(), id]
      );

      console.log('[ProductRepository] Product restored:', id);
    } catch (error) {
      console.error('[ProductRepository] Failed to restore product:', error);
      throw error;
    }
  }

  /**
   * 永久删除产品
   */
  async permanentDelete(id: string): Promise<void> {
    try {
      // 先删除历史记录
      await this.db.runAsync('DELETE FROM inventory_history WHERE productId = ?', [id]);
      
      // 再删除产品
      await this.db.runAsync('DELETE FROM products WHERE id = ?', [id]);

      console.log('[ProductRepository] Product permanently deleted:', id);
    } catch (error) {
      console.error('[ProductRepository] Failed to permanently delete product:', error);
      throw error;
    }
  }

  /**
   * 合并产品（增加库存）
   */
  async merge(existingProductId: string, quantity: number): Promise<void> {
    try {
      const existing = await this.getById(existingProductId);
      if (!existing) {
        throw new Error('Product not found');
      }

      const newQuantity = existing.quantity + quantity;
      
      await this.db.runAsync(
        'UPDATE products SET quantity = ?, updatedAt = ? WHERE id = ?',
        [newQuantity, new Date().toISOString(), existingProductId]
      );

      console.log('[ProductRepository] Product merged:', existingProductId, 'new quantity:', newQuantity);
    } catch (error) {
      console.error('[ProductRepository] Failed to merge product:', error);
      throw error;
    }
  }

  /**
   * 获取用于同步的产品（不包含全景图）
   */
  async getForSync(): Promise<any[]> {
    try {
      const result = await this.db.getAllAsync(
        `SELECT 
          id, sku, quantity, storageLocation, detailImageUri,
          operatorId, operatorName, isDeleted, deletedAt, createdAt, updatedAt
        FROM products`
      );

      console.log('[ProductRepository] Retrieved', result.length, 'products for sync (without overview images)');
      return result;
    } catch (error) {
      console.error('[ProductRepository] Failed to get products for sync:', error);
      return [];
    }
  }

  /**
   * 批量插入产品（用于同步下载）
   */
  async batchUpsert(products: any[]): Promise<void> {
    try {
      console.log('[ProductRepository] Batch upserting', products.length, 'products...');

      for (const product of products) {
        // 检查产品是否存在
        const existing = await this.getById(product.id);
        
        if (existing) {
          // 更新（但不覆盖全景图）
          await this.db.runAsync(
            `UPDATE products SET 
              sku = ?, quantity = ?, storageLocation = ?, detailImageUri = ?,
              operatorId = ?, operatorName = ?, isDeleted = ?, deletedAt = ?, updatedAt = ?
            WHERE id = ?`,
            [
              product.sku,
              product.quantity,
              product.storageLocation,
              product.detailImageUri,
              product.operatorId || 0,
              product.operatorName || '',
              product.isDeleted || 0,
              product.deletedAt || null,
              product.updatedAt || new Date().toISOString(),
              product.id,
            ]
          );
        } else {
          // 插入
          await this.db.runAsync(
            `INSERT INTO products (
              id, sku, quantity, storageLocation, detailImageUri, overviewImageUri,
              operatorId, operatorName, isDeleted, deletedAt, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              product.id,
              product.sku,
              product.quantity,
              product.storageLocation,
              product.detailImageUri,
              null, // 不同步全景图
              product.operatorId || 0,
              product.operatorName || '',
              product.isDeleted || 0,
              product.deletedAt || null,
              product.createdAt || new Date().toISOString(),
              product.updatedAt || new Date().toISOString(),
            ]
          );
        }
      }

      console.log('[ProductRepository] Batch upsert completed');
    } catch (error) {
      console.error('[ProductRepository] Failed to batch upsert:', error);
      throw error;
    }
  }

  /**
   * 获取产品数量统计
   */
  async getStats(): Promise<{ total: number; active: number; deleted: number }> {
    try {
      const totalResult = await this.db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM products'
      );
      
      const activeResult = await this.db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM products WHERE isDeleted = 0'
      );
      
      const deletedResult = await this.db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM products WHERE isDeleted = 1'
      );

      return {
        total: totalResult?.count || 0,
        active: activeResult?.count || 0,
        deleted: deletedResult?.count || 0,
      };
    } catch (error) {
      console.error('[ProductRepository] Failed to get stats:', error);
      return { total: 0, active: 0, deleted: 0 };
    }
  }
}
