import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProductStorage } from "./storage";
import { ProductRepository } from "./product-repository";
import { HistoryRepository } from "./history-repository";

const LAST_SYNC_TIME_KEY = "lastSyncTime";
const SYNC_INTERVAL = 300000; // 5 分钟（优化后）

/**
 * 自动同步工具
 */
export const AutoSync = {
  /**
   * 获取最后同步时间
   */
  async getLastSyncTime(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(LAST_SYNC_TIME_KEY);
    } catch (error) {
      console.error("Failed to get last sync time:", error);
      return null;
    }
  },

  /**
   * 设置最后同步时间
   */
  async setLastSyncTime(): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, new Date().toISOString());
    } catch (error) {
      console.error("Failed to set last sync time:", error);
    }
  },

  /**
   * 格式化同步时间显示
   */
  formatSyncTime(isoString: string | null): string {
    if (!isoString) return "从未同步";

    try {
      const date = new Date(isoString);
      const now = new Date();
      const diff = now.getTime() - date.getTime();

      // 小于 1 分钟
      if (diff < 60000) {
        return "刚刚";
      }

      // 小于 1 小时
      if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} 分钟前`;
      }

      // 小于 24 小时
      if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} 小时前`;
      }

      // 超过 24 小时，显示具体时间
      return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      return "未知";
    }
  },

  /**
   * 检查是否需要同步（超过 30 秒）
   */
  async shouldSync(): Promise<boolean> {
    try {
      const lastSyncTime = await this.getLastSyncTime();
      if (!lastSyncTime) return true;

      const lastSync = new Date(lastSyncTime).getTime();
      const now = new Date().getTime();
      return now - lastSync > SYNC_INTERVAL;
    } catch (error) {
      return true;
    }
  },

  /**
   * 上传本地数据到云端（只同步细节图）
   */
  async uploadToCloud(
    uploadMutation: any,
    onSuccess?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    try {
      console.log('[AutoSync] Starting upload to cloud...');
      
      // 从 SQLite 获取产品（不包含全景图）
      const productRepo = new ProductRepository();
      const products = await productRepo.getForSync();
      
      console.log('[AutoSync] Uploading', products.length, 'products (detail images only)');

      // 调用上传 API
      await uploadMutation.mutateAsync({ products });

      // 更新同步时间
      await this.setLastSyncTime();
      
      console.log('[AutoSync] Upload completed successfully');
      onSuccess?.();
    } catch (error) {
      console.error('[AutoSync] Upload failed:', error);
      onError?.(error);
      throw error;
    }
  },

  /**
   * 从云端下载数据（不包含全景图）
   */
  async downloadFromCloud(
    downloadQuery: any,
    onSuccess?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    try {
      console.log('[AutoSync] Starting download from cloud...');
      
      // 触发下载
      const result = await downloadQuery.refetch();

      if (result.data?.products) {
        console.log('[AutoSync] Downloaded', result.data.products.length, 'products');
        
        // 保存到 SQLite（批量 upsert）
        const productRepo = new ProductRepository();
        await productRepo.batchUpsert(result.data.products);

        // 更新同步时间
        await this.setLastSyncTime();
        
        console.log('[AutoSync] Download completed successfully');
        onSuccess?.();
      }
    } catch (error) {
      console.error('[AutoSync] Download failed:', error);
      onError?.(error);
      throw error;
    }
  },

  /**
   * 双向同步：先上传，再下载
   */
  async syncBothWays(
    uploadMutation: any,
    downloadQuery: any,
    onSuccess?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    try {
      // 先上传本地数据
      await this.uploadToCloud(uploadMutation);

      // 再下载云端数据
      await this.downloadFromCloud(downloadQuery);

      onSuccess?.();
    } catch (error) {
      console.error("Sync failed:", error);
      onError?.(error);
      throw error;
    }
  },
};
