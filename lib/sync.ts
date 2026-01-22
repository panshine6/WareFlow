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

// 分批上传设置
const UPLOAD_BATCH_SIZE = 10; // 每批上传 10 个产品

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

// 上传进度回调类型
export type UploadProgressCallback = (current: number, total: number) => void;

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
 * 将产品转换为上传格式
 */
async function convertProductForUpload(p: Product) {
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
}

/**
 * 数据同步服务
 * 
 * 同步策略：
 * - 分批上传：每次读取和上传 10 个产品，避免内存溢出
 * - 不上传全景图（overviewImageUri 设为空）
 * - 细节图压缩到 512px、质量 50% 后上传（大幅减少存储占用）
 */
export const SyncService = {
  /**
   * 上传本地数据到云端（分批上传）
   * 
   * 策略：
   * - 分批读取和上传产品（每批 10 个），避免 IndexedDB 连接断开
   * - 服务端使用 upsert 避免重复
   * - 不上传全景图
   * - 细节图压缩到 512px、质量 50%（每张约 50-100KB）
   * 
   * @param trpcClient tRPC 客户端
   * @param onProgress 进度回调函数（可选）
   */
  async uploadToCloud(trpcClient: any, onProgress?: UploadProgressCallback): Promise<SyncResult> {
    try {
      console.log("[Sync] Starting batch upload to cloud...");
      
      // 1. 获取产品数量（不加载完整数据，避免内存溢出）
      const { total: totalCount, active: activeCount } = await ProductStorage.getProductCount();
      
      console.log(`[Sync] Found ${totalCount} local products (${activeCount} active)`);
      
      if (totalCount === 0) {
        return {
          success: true,
          direction: "upload",
          count: 0,
          totalCount: 0,
          activeCount: 0,
        };
      }
      
      // 2. 分批处理和上传（每次只加载一批数据到内存）
      let uploadedCount = 0;
      const batchCount = Math.ceil(totalCount / UPLOAD_BATCH_SIZE);
      
      console.log(`[Sync] Will upload in ${batchCount} batches (${UPLOAD_BATCH_SIZE} products per batch)`);
      
      for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
        const startIndex = batchIndex * UPLOAD_BATCH_SIZE;
        const endIndex = Math.min(startIndex + UPLOAD_BATCH_SIZE, totalCount);
        
        // 分批获取产品数据（每次只加载一批，避免内存溢出）
        const batchProducts = await ProductStorage.getProductsBatch(UPLOAD_BATCH_SIZE, batchIndex);
        
        console.log(`[Sync] Processing batch ${batchIndex + 1}/${batchCount} (products ${startIndex + 1}-${endIndex})`);
        
        // 通知进度
        if (onProgress) {
          onProgress(startIndex, totalCount);
        }
        
        try {
          // 压缩图片并转换数据格式（每批单独处理）
          const productsToUpload = await Promise.all(
            batchProducts.map(p => convertProductForUpload(p))
          );
          
          // 上传当前批次
          const result = await trpcClient.sync.upload.mutate({
            products: productsToUpload,
          });
          
          uploadedCount += result.count;
          console.log(`[Sync] Batch ${batchIndex + 1} uploaded: ${result.count} products`);
          
          // 短暂暂停，让浏览器有时间处理其他任务
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (batchError: any) {
          console.error(`[Sync] Batch ${batchIndex + 1} failed:`, batchError);
          // 继续尝试下一批，不中断整个上传过程
          // 但记录错误信息
        }
      }
      
      // 3. 上传用户设置
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
      
      // 4. 更新最后同步时间
      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, now);
      
      // 最终进度通知
      if (onProgress) {
        onProgress(totalCount, totalCount);
      }
      
      console.log(`[Sync] Upload completed: ${uploadedCount} products, ${settingsUploaded} settings synced`);
      
      return {
        success: true,
        direction: "upload",
        count: uploadedCount,
        totalCount,
        activeCount,
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
  async autoSync(trpcClient: any, onProgress?: UploadProgressCallback): Promise<SyncResult> {
    try {
      console.log("[Sync] Starting auto sync...");
      
      // 1. 获取本地和云端数据数量（使用轻量级查询，避免内存溢出）
      const { total: localCount } = await ProductStorage.getProductCount();
      const { cloudCount } = await trpcClient.sync.status.query();
      
      console.log(`[Sync] Local: ${localCount}, Cloud: ${cloudCount}`);
      
      // 2. 如果云端为空，本地有数据 → 上传
      if (cloudCount === 0 && localCount > 0) {
        console.log("[Sync] Cloud is empty, uploading local data...");
        return await this.uploadToCloud(trpcClient, onProgress);
      }
      
      // 3. 如果本地为空，云端有数据 → 下载
      if (localCount === 0 && cloudCount > 0) {
        console.log("[Sync] Local is empty, downloading from cloud...");
        return await this.downloadFromCloud(trpcClient);
      }
      
      // 4. 如果都为空，无需同步
      if (localCount === 0 && cloudCount === 0) {
        console.log("[Sync] Both local and cloud are empty, nothing to sync");
        return {
          success: true,
          direction: "upload",
          count: 0,
        };
      }
      
      // 5. 如果都有数据，简单策略：检查最后同步时间
      const lastSyncTime = await AsyncStorage.getItem(LAST_SYNC_TIME_KEY);
      
      // 简单策略：如果从未同步，默认上传本地数据
      if (!lastSyncTime) {
        console.log("[Sync] Never synced before, uploading local data...");
        return await this.uploadToCloud(trpcClient, onProgress);
      } else {
        // 已经同步过，默认上传（本地优先）
        console.log("[Sync] Has sync history, uploading local data...");
        return await this.uploadToCloud(trpcClient, onProgress);
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
      // 使用轻量级查询获取本地产品数量，避免内存溢出
      const { total: localCount } = await ProductStorage.getProductCount();
      const { cloudCount } = await trpcClient.sync.status.query();
      const lastSyncTime = await AsyncStorage.getItem(LAST_SYNC_TIME_KEY);
      
      // 判断是否需要同步（本地和云端数量不一致）
      const needsSync = localCount !== cloudCount;
      
      return {
        localCount,
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

  /**
   * 仅下载设置和Box数据，保留本地产品数据（包括高分辨率图片）
   * 这个方法不会覆盖本地的产品数据，只同步设置和Box信息
   */
  async downloadSettingsAndBoxesOnly(trpcClient: any): Promise<SyncResult> {
    try {
      console.log("[Sync] Starting settings and boxes only download...");
      
      // 1. 下载用户设置
      let settingsCount = 0;
      try {
        const settingsResult = await trpcClient.sync.downloadSettings.query();
        const settings = settingsResult.settings || [];
        
        for (const setting of settings) {
          try {
            await AsyncStorage.setItem(setting.key, setting.value);
            settingsCount++;
          } catch (e) {
            console.warn(`[Sync] Failed to save setting ${setting.key}:`, e);
          }
        }
        console.log(`[Sync] Downloaded ${settingsCount} settings`);
      } catch (e) {
        console.warn(`[Sync] Failed to download settings:`, e);
      }
      
      // 2. 下载产品数据，但只更新 boxId 和 boxName 字段
      let boxUpdatedCount = 0;
      try {
        const result = await trpcClient.sync.download.query();
        const cloudProducts = result.products || [];
        const localProducts = await ProductStorageAdapter.getAll();
        
        // 创建云端产品的映射（按 ID）
        const cloudProductMap = new Map<string, any>();
        for (const p of cloudProducts) {
          cloudProductMap.set(p.id, p);
        }
        
        // 更新本地产品的 boxId 和 boxName
        let hasUpdates = false;
        for (const localProduct of localProducts) {
          const cloudProduct = cloudProductMap.get(localProduct.id);
          if (cloudProduct) {
            const newBoxId = cloudProduct.boxId || undefined;
            const newBoxName = cloudProduct.boxName || undefined;
            
            // 只有当云端有盒子信息且与本地不同时才更新
            if ((newBoxId && newBoxId !== localProduct.boxId) || 
                (newBoxName && newBoxName !== localProduct.boxName)) {
              localProduct.boxId = newBoxId;
              localProduct.boxName = newBoxName;
              hasUpdates = true;
              boxUpdatedCount++;
            }
          }
        }
        
        // 保存更新后的本地数据
        if (hasUpdates) {
          await ProductStorageAdapter.replaceAll(localProducts);
          console.log(`[Sync] Updated box info for ${boxUpdatedCount} products`);
        }
      } catch (e) {
        console.warn(`[Sync] Failed to update box info:`, e);
      }
      
      // 3. 更新最后同步时间
      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, now);
      
      console.log(`[Sync] Settings and boxes download completed: ${settingsCount} settings, ${boxUpdatedCount} box updates`);
      
      return {
        success: true,
        direction: "download",
        count: settingsCount + boxUpdatedCount,
      };
    } catch (error: any) {
      console.error("[Sync] Settings and boxes download failed:", error);
      return {
        success: false,
        direction: "download",
        count: 0,
        error: error.message || "下载失败",
      };
    }
  },
};
