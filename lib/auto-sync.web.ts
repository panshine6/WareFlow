import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProductStorage } from "./storage";

const LAST_SYNC_TIME_KEY = "lastSyncTime";
const SYNC_INTERVAL = 300000; // 5 分钟

/**
 * 自动同步工具 - Web 版本（不使用 SQLite）
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
   * 检查是否需要同步（超过 5 分钟）
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
   * 上传本地数据到云端 - Web 版本使用 AsyncStorage
   */
  async uploadToCloud(
    uploadMutation: any,
    onSuccess?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    try {
      console.log('[AutoSync.Web] Starting upload to cloud...');
      
      // 从 AsyncStorage 获取产品
      const products = await ProductStorage.getAll();
      
      console.log('[AutoSync.Web] Uploading', products.length, 'products');

      // 调用上传 API
      await uploadMutation.mutateAsync({ products });

      // 更新同步时间
      await this.setLastSyncTime();
      
      console.log('[AutoSync.Web] Upload completed successfully');
      onSuccess?.();
    } catch (error) {
      console.error('[AutoSync.Web] Upload failed:', error);
      onError?.(error);
      throw error;
    }
  },

  /**
   * 从云端下载数据 - Web 版本使用 AsyncStorage
   */
  async downloadFromCloud(
    downloadQuery: any,
    onSuccess?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    try {
      console.log('[AutoSync.Web] Starting download from cloud...');
      
      // 触发下载
      const result = await downloadQuery.refetch();

      if (result.data?.products) {
        console.log('[AutoSync.Web] Downloaded', result.data.products.length, 'products');
        
        // 保存到 AsyncStorage
        for (const product of result.data.products) {
          await ProductStorage.save(product);
        }

        // 更新同步时间
        await this.setLastSyncTime();
        
        console.log('[AutoSync.Web] Download completed successfully');
        onSuccess?.();
      }
    } catch (error) {
      console.error('[AutoSync.Web] Download failed:', error);
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
