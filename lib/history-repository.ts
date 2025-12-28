/**
 * 历史记录数据访问层（Repository）
 * 负责所有入库历史相关的数据库操作
 */
import * as SQLite from 'expo-sqlite';
import { SQLiteDatabase } from './sqlite-database';
import type { InventoryHistory } from '@/types/product';

export class HistoryRepository {
  private db: SQLite.SQLiteDatabase;

  constructor() {
    this.db = SQLiteDatabase.getInstance().getDatabase();
  }

  /**
   * 创建历史记录
   */
  async create(history: InventoryHistory & { productId: string }): Promise<void> {
    try {
      await this.db.runAsync(
        `INSERT INTO inventory_history (
          id, productId, timestamp, operatorId, operatorName,
          quantity, location, detailImageUri, overviewImageUri, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          history.id,
          history.productId,
          history.timestamp,
          history.operatorId || 0,
          history.operatorName || '',
          history.quantity,
          history.location,
          history.detailImageUri,
          history.overviewImageUri || null,
          history.notes || null,
        ]
      );

      console.log('[HistoryRepository] History created:', history.id);
    } catch (error) {
      console.error('[HistoryRepository] Failed to create history:', error);
      throw error;
    }
  }

  /**
   * 删除历史记录的全景图（释放空间）
   */
  async deleteOverviewImage(historyId: string): Promise<void> {
    try {
      await this.db.runAsync(
        'UPDATE inventory_history SET overviewImageUri = NULL WHERE id = ?',
        [historyId]
      );

      console.log('[HistoryRepository] Overview image deleted for history:', historyId);
    } catch (error) {
      console.error('[HistoryRepository] Failed to delete overview image:', error);
      throw error;
    }
  }

  /**
   * 获取所有历史记录
   */
  async getAll(): Promise<InventoryHistory[]> {
    try {
      const result = await this.db.getAllAsync<InventoryHistory>(
        'SELECT * FROM inventory_history ORDER BY timestamp DESC'
      );

      console.log('[HistoryRepository] Retrieved', result.length, 'history records');
      return result;
    } catch (error) {
      console.error('[HistoryRepository] Failed to get all history:', error);
      return [];
    }
  }

  /**
   * 根据产品 ID 获取历史记录
   */
  async getByProductId(productId: string): Promise<InventoryHistory[]> {
    try {
      const result = await this.db.getAllAsync<InventoryHistory>(
        'SELECT * FROM inventory_history WHERE productId = ? ORDER BY timestamp DESC',
        [productId]
      );

      console.log('[HistoryRepository] Retrieved', result.length, 'history records for product:', productId);
      return result;
    } catch (error) {
      console.error('[HistoryRepository] Failed to get history by product ID:', error);
      return [];
    }
  }

  /**
   * 根据 ID 获取历史记录
   */
  async getById(id: string): Promise<InventoryHistory | null> {
    try {
      const result = await this.db.getFirstAsync<InventoryHistory>(
        'SELECT * FROM inventory_history WHERE id = ?',
        [id]
      );

      return result || null;
    } catch (error) {
      console.error('[HistoryRepository] Failed to get history by ID:', error);
      return null;
    }
  }

  /**
   * 删除历史记录
   */
  async delete(id: string): Promise<void> {
    try {
      await this.db.runAsync('DELETE FROM inventory_history WHERE id = ?', [id]);

      console.log('[HistoryRepository] History deleted:', id);
    } catch (error) {
      console.error('[HistoryRepository] Failed to delete history:', error);
      throw error;
    }
  }

  /**
   * 删除产品的所有历史记录
   */
  async deleteByProductId(productId: string): Promise<void> {
    try {
      await this.db.runAsync('DELETE FROM inventory_history WHERE productId = ?', [productId]);

      console.log('[HistoryRepository] All history deleted for product:', productId);
    } catch (error) {
      console.error('[HistoryRepository] Failed to delete history by product ID:', error);
      throw error;
    }
  }

  /**
   * 获取用于同步的历史记录（不包含全景图）
   */
  async getForSync(): Promise<any[]> {
    try {
      const result = await this.db.getAllAsync(
        `SELECT 
          id, productId, timestamp, operatorId, operatorName,
          quantity, location, detailImageUri, notes
        FROM inventory_history`
      );

      console.log('[HistoryRepository] Retrieved', result.length, 'history records for sync (without overview images)');
      return result;
    } catch (error) {
      console.error('[HistoryRepository] Failed to get history for sync:', error);
      return [];
    }
  }

  /**
   * 批量插入历史记录（用于同步下载）
   */
  async batchUpsert(histories: any[]): Promise<void> {
    try {
      console.log('[HistoryRepository] Batch upserting', histories.length, 'history records...');

      for (const history of histories) {
        // 检查历史记录是否存在
        const existing = await this.getById(history.id);
        
        if (!existing) {
          // 插入（历史记录通常不更新，只插入新的）
          await this.db.runAsync(
            `INSERT INTO inventory_history (
              id, productId, timestamp, operatorId, operatorName,
              quantity, location, detailImageUri, overviewImageUri, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              history.id,
              history.productId,
              history.timestamp,
              history.operatorId || 0,
              history.operatorName || '',
              history.quantity,
              history.location,
              history.detailImageUri,
              null, // 不同步全景图
              history.notes || null,
            ]
          );
        }
      }

      console.log('[HistoryRepository] Batch upsert completed');
    } catch (error) {
      console.error('[HistoryRepository] Failed to batch upsert:', error);
      throw error;
    }
  }

  /**
   * 获取历史记录统计
   */
  async getStats(): Promise<{ total: number }> {
    try {
      const result = await this.db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM inventory_history'
      );

      return {
        total: result?.count || 0,
      };
    } catch (error) {
      console.error('[HistoryRepository] Failed to get stats:', error);
      return { total: 0 };
    }
  }
}
