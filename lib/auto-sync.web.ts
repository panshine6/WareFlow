import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProductStorage } from "./storage";
import { generateThumbnailDataUrl } from "./image-utils";

const LAST_SYNC_TIME_KEY = "lastSyncTime";
const SYNC_INTERVAL = 300000; // 5 分钟

/**
 * 自动同步工具 - Web 版本（不使用 SQLite）
 * 
 * 优化策略：
 * - 不上传全景图（overviewImageUri 设为空）
 * - 细节图压缩为 512×512 缩略图再上传
 * - 大幅减少云端存储空间占用
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
   * 将图片压缩为缩略图用于云端存储
   * @param imageUri 原始图片 URI（Data URL 或 Base64）
   * @returns 压缩后的 Data URL
   */
  async compressForCloud(imageUri: string): Promise<string> {
    try {
      // 如果是空字符串，直接返回
      if (!imageUri || imageUri.trim() === "") {
        return "";
      }

      // 确保是 Data URL 格式
      let dataUrl = imageUri;
      if (!imageUri.startsWith("data:")) {
        dataUrl = `data:image/jpeg;base64,${imageUri}`;
      }

      // 生成 512×512 缩略图，质量 0.6
      const thumbnailDataUrl = await generateThumbnailDataUrl(dataUrl, 512, 0.6);
      return thumbnailDataUrl;
    } catch (error) {
      console.error("[AutoSync] Failed to compress image:", error);
      // 压缩失败时返回原图
      return imageUri;
    }
  },

  /**
   * 上传本地数据到云端 - Web 版本
   * 
   * 优化：
   * - 不上传全景图
   * - 细节图压缩为 512×512 缩略图
   */
  async uploadToCloud(
    uploadMutation: any,
    onSuccess?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    try {
      console.log('[AutoSync.Web] Starting upload to cloud...');
      
      // 从 IndexedDB/AsyncStorage 获取产品
      const products = await ProductStorage.getAll();
      
      console.log('[AutoSync.Web] Found', products.length, 'products, compressing images...');

      // 压缩图片并准备上传数据
      const productsToUpload = await Promise.all(
        products.map(async (p) => {
          // 压缩细节图为缩略图
          const compressedDetailImage = await this.compressForCloud(p.detailImageUri);
          
          return {
            id: p.id,
            detailImageUri: compressedDetailImage, // 压缩后的缩略图
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
        })
      );

      console.log('[AutoSync.Web] Image compression completed, uploading...');

      // 调用上传 API
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
   * 注意：云端存储的是缩略图，下载后本地也是缩略图
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
