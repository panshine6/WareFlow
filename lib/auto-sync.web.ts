import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProductStorage } from "./storage";

const LAST_SYNC_TIME_KEY = "lastSyncTime";
const SYNC_INTERVAL = 300000; // 5 分钟

/**
 * 自动同步工具 - Web 版本（不使用 SQLite）
 * 
 * 同步策略：
 * - 增量同步：只上传自上次同步后有变化的产品
 * - 不上传全景图（overviewImageUri 设为空）
 * - 细节图直接上传本地 2K 版本，不再二次压缩
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
   * 上传本地数据到云端 - Web 版本（增量同步）
   * 
   * 策略：
   * - 只上传自上次同步后有变化的产品（根据 updatedAt 判断）
   * - 不上传全景图
   * - 细节图直接上传本地 2K 版本，不再二次压缩
   * 
   * @param forceFullSync 是否强制全量同步（默认 false，增量同步）
   */
  async uploadToCloud(
    uploadMutation: any,
    onSuccess?: () => void,
    onError?: (error: any) => void,
    forceFullSync: boolean = false
  ): Promise<void> {
    try {
      console.log('[AutoSync.Web] Starting upload to cloud...');
      
      // 从 IndexedDB/AsyncStorage 获取所有产品
      const allProducts = await ProductStorage.getAll();
      
      // 获取上次同步时间
      const lastSyncTime = await this.getLastSyncTime();
      const lastSyncDate = lastSyncTime ? new Date(lastSyncTime) : null;
      
      // 筛选需要上传的产品
      let productsToSync = allProducts;
      
      if (!forceFullSync && lastSyncDate) {
        // 增量同步：只上传 updatedAt 大于上次同步时间的产品
        productsToSync = allProducts.filter((p) => {
          const productUpdatedAt = new Date(p.updatedAt || p.createdAt);
          return productUpdatedAt > lastSyncDate;
        });
        
        console.log('[AutoSync.Web] Incremental sync: found', productsToSync.length, 'changed products out of', allProducts.length, 'total');
      } else {
        console.log('[AutoSync.Web] Full sync: uploading all', allProducts.length, 'products');
      }
      
      // 如果没有需要同步的产品，直接返回
      if (productsToSync.length === 0) {
        console.log('[AutoSync.Web] No changes to sync');
        await this.setLastSyncTime();
        onSuccess?.();
        return;
      }

      // 准备上传数据（直接使用本地 2K 图片，不再压缩）
      const productsToUpload = productsToSync.map((p) => {
        return {
          id: p.id,
          detailImageUri: p.detailImageUri, // 直接上传本地 2K 版本
          overviewImageUri: "", // 不上传全景图
          sku: p.sku,
          quantity: p.quantity,
          storageLocation: p.storageLocation,
          operatorId: p.operatorId || 0,
          operatorName: p.operatorName || "",
          isDeleted: p.isDeleted ? 1 : 0,
          deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt || p.createdAt),
        };
      });

      console.log('[AutoSync.Web] Uploading', productsToUpload.length, 'products...');

      // 调用上传 API（服务端会使用 upsert 增量更新）
      await uploadMutation.mutateAsync({ products: productsToUpload });

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
   * 从云端下载数据 - Web 版本
   * 
   * 注意：云端存储的是本地 2K 版本的细节图
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
        
        // 保存到 IndexedDB/AsyncStorage
        for (const product of result.data.products) {
          // 转换数据格式
          const localProduct = {
            ...product,
            isDeleted: product.isDeleted === 1,
            deletedAt: product.deletedAt ? new Date(product.deletedAt).toISOString() : undefined,
            createdAt: new Date(product.createdAt).toISOString(),
            updatedAt: new Date(product.updatedAt).toISOString(),
            history: [], // 历史记录需要单独处理
          };
          // 检查产品是否已存在，存在则更新，不存在则添加
          const existing = await ProductStorage.getById(localProduct.id);
          if (existing) {
            await ProductStorage.update(localProduct.id, localProduct);
          } else {
            await ProductStorage.add(localProduct);
          }
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
