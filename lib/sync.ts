import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProductStorage } from "./storage";
import type { Product } from "@/types/product";

const LAST_SYNC_TIME_KEY = "lastSyncTime";

export interface SyncStatus {
  localCount: number;
  cloudCount: number;
  lastSyncTime: string | null;
  needsSync: boolean;
}

export interface SyncResult {
  success: boolean;
  direction: "upload" | "download";
  count: number;
  totalCount?: number; // 总产品数（含已删除）
  activeCount?: number; // 有效产品数（未删除）
  error?: string;
}

/**
 * 数据同步服务
 * 
 * 同步策略：
 * - 增量同步：只上传自上次同步后有变化的产品
 * - 不上传全景图（overviewImageUri 设为空）
 * - 细节图直接上传本地 2K 版本，不再二次压缩
 */
export const SyncService = {
  /**
   * 上传本地数据到云端（全量同步）
   * 
   * 策略：
   * - 上传所有本地产品（服务端使用 upsert 避免重复）
   * - 不上传全景图
   * - 细节图直接上传本地 2K 版本
   */
  async uploadToCloud(trpcClient: any): Promise<SyncResult> {
    try {
      console.log("[Sync] Starting full upload to cloud...");
      
      // 1. 获取本地所有数据
      const allProducts = await ProductStorage.getAll();
      const activeProducts = allProducts.filter(p => !p.isDeleted);
      console.log(`[Sync] Found ${allProducts.length} local products (${activeProducts.length} active)`);
      
      if (allProducts.length === 0) {
        return {
          success: true,
          direction: "upload",
          count: 0,
          totalCount: 0,
        };
      }
      
      // 2. 转换数据格式（直接使用本地 2K 图片，不再压缩）
      const productsToUpload = allProducts.map((p) => ({
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
      }));
      
      // 3. 上传到云端（服务端使用 upsert 增量更新）
      console.log(`[Sync] Uploading ${productsToUpload.length} products...`);
      const result = await trpcClient.sync.upload.mutate({
        products: productsToUpload,
      });
      
      // 4. 更新最后同步时间
      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, now);
      
      console.log(`[Sync] Upload completed: ${result.count} products synced`);
      
      return {
        success: true,
        direction: "upload",
        count: result.count,
        totalCount: allProducts.length,
        activeCount: activeProducts.length,
      };
    } catch (error: any) {
      console.error("[Sync] Upload failed:", error);
      return {
        success: false,
        direction: "upload",
        count: 0,
        error: error.message || "上传失败",
      };
    }
  },

  /**
   * 从云端下载数据到本地（覆盖本地数据）
   * 
   * 注意：云端存储的是本地 2K 版本的细节图
   */
  async downloadFromCloud(trpcClient: any): Promise<SyncResult> {
    try {
      console.log("[Sync] Starting download from cloud...");
      
      // 1. 从云端获取数据
      const { products } = await trpcClient.sync.download.query();
      console.log(`[Sync] Downloaded ${products.length} products from cloud`);
      
      // 2. 转换数据格式
      const localProducts: Product[] = products.map((p: any) => ({
        id: p.id,
        detailImageUri: p.detailImageUri, // 云端存储的是 2K 版本
        overviewImageUri: p.overviewImageUri || "", // 云端不存全景图
        sku: p.sku,
        quantity: p.quantity,
        storageLocation: p.storageLocation,
        operatorId: p.operatorId,
        operatorName: p.operatorName,
        isDeleted: p.isDeleted === 1,
        deletedAt: p.deletedAt ? new Date(p.deletedAt as any).toISOString() : undefined,
        createdAt: new Date(p.createdAt).toISOString(),
        updatedAt: new Date(p.updatedAt).toISOString(),
        history: [], // 历史记录需要单独查询
      }));
      
      // 3. 清空本地数据并保存云端数据
      await AsyncStorage.removeItem("products");
      await AsyncStorage.setItem("products", JSON.stringify(localProducts));
      
      // 4. 更新最后同步时间
      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, now);
      
      console.log(`[Sync] Download completed: ${localProducts.length} products`);
      
      return {
        success: true,
        direction: "download",
        count: localProducts.length,
      };
    } catch (error: any) {
      console.error("[Sync] Download failed:", error);
      return {
        success: false,
        direction: "download",
        count: 0,
        error: error.message || "下载失败",
      };
    }
  },

  /**
   * 自动同步（智能选择方向）
   * 
   * 策略：
   * - 如果云端为空，本地有数据 → 上传
   * - 如果本地为空，云端有数据 → 下载
   * - 如果都有数据，比较最后更新时间 → 上传较新的
   */
  async autoSync(trpcClient: any): Promise<SyncResult> {
    try {
      console.log("[Sync] Starting auto sync...");
      
      // 1. 获取本地和云端数据数量
      const localProducts = await ProductStorage.getAll();
      const { cloudCount } = await trpcClient.sync.status.query();
      
      console.log(`[Sync] Local: ${localProducts.length}, Cloud: ${cloudCount}`);
      
      // 2. 如果云端为空，本地有数据 → 上传
      if (cloudCount === 0 && localProducts.length > 0) {
        console.log("[Sync] Cloud is empty, uploading local data...");
        return await this.uploadToCloud(trpcClient);
      }
      
      // 3. 如果本地为空，云端有数据 → 下载
      if (localProducts.length === 0 && cloudCount > 0) {
        console.log("[Sync] Local is empty, downloading from cloud...");
        return await this.downloadFromCloud(trpcClient);
      }
      
      // 4. 如果都为空，无需同步
      if (localProducts.length === 0 && cloudCount === 0) {
        console.log("[Sync] Both local and cloud are empty, nothing to sync");
        return {
          success: true,
          direction: "upload",
          count: 0,
        };
      }
      
      // 5. 如果都有数据，比较最后更新时间
      const lastSyncTime = await AsyncStorage.getItem(LAST_SYNC_TIME_KEY);
      const localLatest = localProducts.reduce((latest, p) => {
        const time = new Date(p.updatedAt || p.createdAt).getTime();
        return time > latest ? time : latest;
      }, 0);
      
      // 简单策略：如果本地有更新（或从未同步），上传；否则下载
      if (!lastSyncTime || localLatest > new Date(lastSyncTime).getTime()) {
        console.log("[Sync] Local has updates, uploading...");
        return await this.uploadToCloud(trpcClient);
      } else {
        console.log("[Sync] Cloud may have updates, downloading...");
        return await this.downloadFromCloud(trpcClient);
      }
    } catch (error: any) {
      console.error("[Sync] Auto sync failed:", error);
      return {
        success: false,
        direction: "upload",
        count: 0,
        error: error.message || "自动同步失败",
      };
    }
  },

  /**
   * 获取同步状态
   */
  async getStatus(trpcClient: any): Promise<SyncStatus> {
    try {
      const localProducts = await ProductStorage.getAll();
      const { cloudCount } = await trpcClient.sync.status.query();
      const lastSyncTime = await AsyncStorage.getItem(LAST_SYNC_TIME_KEY);
      
      // 判断是否需要同步（本地和云端数量不一致）
      const needsSync = localProducts.length !== cloudCount;
      
      return {
        localCount: localProducts.length,
        cloudCount,
        lastSyncTime,
        needsSync,
      };
    } catch (error: any) {
      console.error("[Sync] Get status failed:", error);
      return {
        localCount: 0,
        cloudCount: 0,
        lastSyncTime: null,
        needsSync: false,
      };
    }
  },

  /**
   * 检查是否配置了数据库
   */
  async isDatabaseConfigured(trpcClient: any): Promise<boolean> {
    try {
      await trpcClient.sync.status.query();
      return true;
    } catch (error) {
      return false;
    }
  },
};
