import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProductStorage } from "./storage";
import { ProductStorageAdapter } from "./storage-adapter";
import { generateThumbnail } from "./image-utils";
import type { Product } from "@/types/product";

const LAST_SYNC_TIME_KEY = "lastSyncTime";

// 需要同步到云端的设置键名列表
const SYNC_SETTINGS_KEYS = [
  "sku_sequences_v2",      // SKU生成器 - 各分类的流水号序列
  "sku_segments_v2",       // SKU生成器 - 自定义分段选项
  "sku_history_v2",        // SKU生成器 - 生成历史记录
  "sku_last_selection",    // SKU生成器 - 上次选择的分段值
  "box_list_v1",           // Box管理器 - Box列表
  "box_sequence_v1",       // Box管理器 - Box流水号序列
  "settings",              // 用户设置（默认位置等）
  "exported_labels",       // 已导出标签记录
  "outbound_records",      // 出库记录
  "ai_learning_records",   // AI学习记录
];

// 云端图片压缩设置
const CLOUD_IMAGE_MAX_SIZE = 512; // 最大边长 512px
const CLOUD_IMAGE_QUALITY = 0.5; // JPEG 质量 50%

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
 * 压缩图片用于云端存储
 * @param base64OrDataUrl 原始图片（Base64 或 Data URL）
 * @returns 压缩后的 Base64（不含前缀）
 */
async function compressImageForCloud(base64OrDataUrl: string): Promise<string> {
  if (!base64OrDataUrl) return "";
  
  try {
    // 移除 Data URL 前缀（如果有）
    let base64 = base64OrDataUrl;
    if (base64OrDataUrl.startsWith("data:")) {
      base64 = base64OrDataUrl.split(",")[1] || "";
    }
    
    if (!base64) return "";
    
    // 使用 generateThumbnail 压缩图片
    const compressed = await generateThumbnail(base64, CLOUD_IMAGE_MAX_SIZE, CLOUD_IMAGE_QUALITY);
    return compressed;
  } catch (error) {
    console.warn("[Sync] Failed to compress image, using original:", error);
    // 压缩失败时返回原图（移除前缀）
    if (base64OrDataUrl.startsWith("data:")) {
      return base64OrDataUrl.split(",")[1] || "";
    }
    return base64OrDataUrl;
  }
}

/**
 * 数据同步服务
 * 
 * 同步策略：
 * - 增量同步：只上传自上次同步后有变化的产品
 * - 不上传全景图（overviewImageUri 设为空）
 * - 细节图压缩到 512px、质量 50% 后上传（大幅减少存储占用）
 */
export const SyncService = {
  /**
   * 上传本地数据到云端（全量同步）
   * 
   * 策略：
   * - 上传所有本地产品（服务端使用 upsert 避免重复）
   * - 不上传全景图
   * - 细节图压缩到 512px、质量 50%（每张约 50-100KB）
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
      
      // 2. 压缩图片并转换数据格式
      console.log(`[Sync] Compressing images for cloud storage (${CLOUD_IMAGE_MAX_SIZE}px, ${CLOUD_IMAGE_QUALITY * 100}% quality)...`);
      
      const productsToUpload = await Promise.all(
        allProducts.map(async (p) => {
          // 压缩细节图
          const compressedImage = await compressImageForCloud(p.detailImageUri);
          
          return {
            id: p.id,
            detailImageUri: compressedImage, // 压缩后的图片
            overviewImageUri: "", // 不上传全景图
            sku: p.sku,
            systemSku: p.systemSku || null, // 系统生成的 SKU（条形码）
            boxId: p.boxId || null, // 所属 Box ID
            boxName: p.boxName || null, // 所属 Box 名称
            price: p.price?.toString() || null, // 产品价格
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
      
      console.log(`[Sync] Image compression complete`);
      
      // 3. 上传到云端（服务端使用 upsert 增量更新）
      console.log(`[Sync] Uploading ${productsToUpload.length} products...`);
      const result = await trpcClient.sync.upload.mutate({
        products: productsToUpload,
      });
      
      // 4. 上传用户设置
      let settingsUploaded = 0;
      console.log(`[Sync] Uploading user settings...`);
      const settingsToUpload: { key: string; value: string }[] = [];
      for (const key of SYNC_SETTINGS_KEYS) {
        try {
          const value = await AsyncStorage.getItem(key);
          if (value !== null) {
            settingsToUpload.push({ key, value });
          }
        } catch (e) {
          console.warn(`[Sync] Failed to get setting ${key}:`, e);
        }
      }
      
      if (settingsToUpload.length > 0) {
        try {
          await trpcClient.sync.uploadSettings.mutate({ settings: settingsToUpload });
          settingsUploaded = settingsToUpload.length;
          console.log(`[Sync] Uploaded ${settingsToUpload.length} settings`);
        } catch (e) {
          console.warn(`[Sync] Failed to upload settings:`, e);
        }
      }
      
      // 5. 更新最后同步时间
      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, now);
      
      console.log(`[Sync] Upload completed: ${result.count} products, ${settingsUploaded} settings synced`);
      
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
   * 策略：
   * - 所有平台都下载完整数据（包含图片）
   * - 之前电脑 Web 端不下载图片是为了节省空间，但由于 Cloudflare Pages 不支持 API 调用，
   *   无法按需加载图片，所以改为下载完整数据
   */
  async downloadFromCloud(trpcClient: any): Promise<SyncResult> {
    try {
      console.log("[Sync] Starting download from cloud...");
      
      // 所有平台都下载完整数据（包含图片）
      console.log("[Sync] Downloading full data with images...");
      const result = await trpcClient.sync.download.query();
      const products = result.products;
      
      console.log(`[Sync] Downloaded ${products.length} products from cloud`);
      
      // 3. 转换数据格式
      const localProducts: Product[] = products.map((p: any) => ({
        id: p.id,
        detailImageUri: p.detailImageUri || '',
        overviewImageUri: p.overviewImageUri || '',
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
        // 盒子关联信息
        boxId: p.boxId || undefined,
        boxName: p.boxName || undefined,
        // 价格信息
        price: p.price || undefined,
      }));
      
      // 4. 清空本地数据并保存云端数据（使用适配器确保 Web 端使用 IndexedDB）
      await ProductStorageAdapter.replaceAll(localProducts);
      
      // 5. 下载用户设置
      console.log(`[Sync] Downloading user settings...`);
      try {
        const settingsResult = await trpcClient.sync.downloadSettings.query();
        const settings = settingsResult.settings || [];
        
        for (const setting of settings) {
          try {
            await AsyncStorage.setItem(setting.key, setting.value);
          } catch (e) {
            console.warn(`[Sync] Failed to save setting ${setting.key}:`, e);
          }
        }
        console.log(`[Sync] Downloaded ${settings.length} settings`);
      } catch (e) {
        console.warn(`[Sync] Failed to download settings:`, e);
      }
      
      // 6. 更新最后同步时间
      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, now);
      
      // 7. 统计有效产品数量（未删除的）
      const activeProducts = localProducts.filter(p => !p.isDeleted);
      
      console.log(`[Sync] Download completed: ${activeProducts.length} active products (${localProducts.length} total)`);
      
      return {
        success: true,
        direction: "download",
        count: activeProducts.length, // 返回有效产品数量
        totalCount: localProducts.length, // 总数（含已删除）
        activeCount: activeProducts.length, // 有效数量
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
