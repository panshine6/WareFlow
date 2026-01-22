/**
 * 去重处理工具函数
 * 使用 pHash 预筛选 + AI 精确对比的两阶段策略
 */

import { Platform } from "react-native";
import { ProductAPI } from "./api-client";
import { ProductStorage } from "./storage";
import { batchCompareImages } from "./ai-vision";
import { calculatePHashFromBase64, filterSimilarByPHash, PHASH_THRESHOLDS } from "./phash";
import type { Product } from "@/types/product";

// 放宽 pHash 阈值，避免漏掉相似产品
const PHASH_THRESHOLD_FOR_DEDUP = 25; // 汉明距离阈值，越大越宽松

/**
 * 从 Data URL 或 Base64 字符串中提取纯 Base64 数据
 * 数据库中的 detailImageUri 存储的是 Data URL 格式：data:image/jpeg;base64,xxxxx
 */
export function extractBase64FromDataUrl(dataUrl: string): string {
  if (!dataUrl) {
    throw new Error("图片数据为空");
  }
  
  // 如果是 Data URL 格式，提取 Base64 部分
  if (dataUrl.startsWith("data:")) {
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex !== -1) {
      return dataUrl.substring(commaIndex + 1);
    }
  }
  
  // 如果已经是纯 Base64，直接返回
  return dataUrl;
}

/**
 * 将图片 URI 转换为 Base64（兼容 Data URL 和网络 URL）
 * 优先直接提取 Data URL 中的 Base64，避免不必要的网络请求
 */
export async function imageToBase64(uri: string, retries = 3): Promise<string> {
  // 如果是 Data URL，直接提取 Base64（无需网络请求）
  if (uri.startsWith("data:")) {
    console.log("[Image] Extracting base64 from Data URL (no network request needed)");
    return extractBase64FromDataUrl(uri);
  }
  
  // 如果是网络 URL，才进行 fetch
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[Image] Fetching from URL (attempt ${i + 1}/${retries}):`, uri.substring(0, 50) + "...");
      
      // 创建超时控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      const response = await fetch(uri, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      
      // 将 Blob 转换为 Base64
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // 移除 data:image/...;base64, 前缀
          const base64Data = base64.split(",")[1] || base64;
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error: any) {
      console.error(`[Image] Fetch failed (attempt ${i + 1}):`, error);
      if (i === retries - 1) {
        throw new Error(`图片加载失败: ${error.message}`);
      }
      // 等待 1 秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Image conversion failed after retries");
}

export interface DuplicateCheckResult {
  hasDuplicates: boolean;
  duplicates: Array<{
    product: Product;
    similarityScore: number;
    analysisNote: string;
    scores?: number[];  // 3次查重的分数
    confidence?: 'high' | 'medium' | 'low';  // 置信度
  }>;
  error?: string;
  /** 统计信息 */
  stats?: {
    totalProducts: number;
    pHashFiltered: number;
    aiCompared: number;
    durationMs: number;
  };
}

/**
 * 执行去重检查（两阶段策略：pHash 预筛选 + AI 精确对比）
 * @param detailImageUri 新拍摄的细节图 URI（Data URL 格式）
 * @param detailImageBase64 新拍摄的细节图 Base64（可选，如果提供则不需要转换）
 * @param threshold 相似度阈值 (0-100)
 * @returns 去重检查结果
 */
export async function performDuplicateCheck(
  detailImageUri: string,
  detailImageBase64?: string,
  threshold: number = 80 // 阈值80%，只显示高度相似的产品
): Promise<DuplicateCheckResult> {
  const startTime = Date.now();
  
  try {
    console.log("[Dedup] ========== Starting duplicate check (pHash + AI) ==========");
    console.log("[Dedup] Detail image URI type:", detailImageUri.startsWith("data:") ? "Data URL" : "Network URL");
    console.log("[Dedup] Has base64:", !!detailImageBase64);
    console.log("[Dedup] Threshold:", threshold);
    
    // 1. 获取新图片的 Base64
    let newImageBase64 = detailImageBase64;
    if (!newImageBase64) {
      console.log("[Dedup] Extracting base64 from new image...");
      newImageBase64 = extractBase64FromDataUrl(detailImageUri);
      console.log("[Dedup] Extraction successful, base64 length:", newImageBase64.length);
    }
    
    // 2. 获取所有活跃产品（使用轻量级查询，不加载图片数据）
    const isWeb = Platform.OS === 'web';
    console.log("[Dedup] Loading active products from", isWeb ? "local storage (light)" : "cloud", "...");
    const allProducts = isWeb 
      ? await ProductStorage.getActiveLight()  // 使用轻量级查询，避免加载大量 base64 图片
      : await ProductAPI.getActive();
    console.log("[Dedup] Loaded", allProducts.length, "active products (light mode, no images)");
    
    if (allProducts.length === 0) {
      console.log("[Dedup] No existing products, skipping comparison");
      return {
        hasDuplicates: false,
        duplicates: [],
        stats: {
          totalProducts: 0,
          pHashFiltered: 0,
          aiCompared: 0,
          durationMs: Date.now() - startTime,
        },
      };
    }
    
    // 3. 决定哪些产品需要进行 AI 对比
    let productsToCompare: Product[] = [];
    let pHashFilteredCount = 0;
    
    if (isWeb) {
      try {
        console.log("[Dedup] Calculating pHash for new image...");
        const newImageHash = await calculatePHashFromBase64(newImageBase64);
        console.log("[Dedup] New image pHash:", newImageHash);
        
        // 分离有 pHash 和没有 pHash 的产品
        const productsWithHash = allProducts.filter(p => p.imageHash);
        const productsWithoutHash = allProducts.filter(p => !p.imageHash);
        
        console.log("[Dedup] Products with pHash:", productsWithHash.length);
        console.log("[Dedup] Products without pHash:", productsWithoutHash.length);
        
        // 对有 pHash 的产品进行预筛选
        if (productsWithHash.length > 0) {
          const existingHashes = productsWithHash.map(p => ({
            id: p.id,
            hash: p.imageHash!,
          }));
          
          const similarByPHash = filterSimilarByPHash(
            newImageHash,
            existingHashes,
            PHASH_THRESHOLD_FOR_DEDUP // 使用更宽松的阈值
          );
          
          console.log("[Dedup] pHash pre-filter results:", similarByPHash.length, "potentially similar (threshold:", PHASH_THRESHOLD_FOR_DEDUP, ")");
          similarByPHash.forEach(({ id, distance }) => {
            const product = allProducts.find(p => p.id === id);
            console.log(`  - ${product?.sku || id}: distance=${distance}`);
          });
          
          // 收集 pHash 筛选出的产品
          const filteredIds = new Set(similarByPHash.map(r => r.id));
          const pHashFilteredProducts = allProducts.filter(p => filteredIds.has(p.id));
          
          pHashFilteredCount = productsWithHash.length - pHashFilteredProducts.length;
          
          // 合并：pHash 筛选出的 + 没有 pHash 的
          productsToCompare = [...pHashFilteredProducts, ...productsWithoutHash];
        } else {
          // 没有任何产品有 pHash，全部进行 AI 对比
          productsToCompare = allProducts;
        }
        
        console.log("[Dedup] Products to compare with AI:", productsToCompare.length);
      } catch (error) {
        console.warn("[Dedup] pHash calculation failed, falling back to full AI comparison:", error);
        // pHash 失败时回退到全量 AI 对比
        productsToCompare = allProducts;
      }
    } else {
      // 非 Web 平台，全量 AI 对比
      productsToCompare = allProducts;
    }
    
    // 4. 如果没有候选产品，直接返回
    if (productsToCompare.length === 0) {
      console.log("[Dedup] No candidates to compare, no duplicates");
      return {
        hasDuplicates: false,
        duplicates: [],
        stats: {
          totalProducts: allProducts.length,
          pHashFiltered: pHashFilteredCount,
          aiCompared: 0,
          durationMs: Date.now() - startTime,
        },
      };
    }
    
    // 5. 按需从 IndexedDB 加载产品图片数据
    // 使用 getProductImage 函数逐个加载，避免一次性加载所有图片到内存
    console.log("[Dedup] Loading product images on-demand from IndexedDB...");
    const existingImages: Array<{ id: string; base64: string }> = [];
    
    const extractStartTime = Date.now();
    // 分批加载图片，每批 5 个，避免内存峰值
    const BATCH_SIZE = 5;
    for (let i = 0; i < productsToCompare.length; i += BATCH_SIZE) {
      const batch = productsToCompare.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (product) => {
        try {
          // 按需从 IndexedDB 加载单个产品的图片
          if (isWeb) {
            const imageData = await ProductStorage.getProductImage(product.id);
            if (imageData && imageData.detailImageUri) {
              const base64 = extractBase64FromDataUrl(imageData.detailImageUri);
              return { id: product.id, base64 };
            }
          } else {
            // 非 Web 平台使用原有逻辑
            if (product.detailImageUri) {
              const base64 = extractBase64FromDataUrl(product.detailImageUri);
              return { id: product.id, base64 };
            }
          }
          return null;
        } catch (error: any) {
          console.error(`[Dedup] Failed to load image for product ${product.sku}:`, error.message);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(result => {
        if (result) {
          existingImages.push(result);
        }
      });
      
      // 短暂暂停，让浏览器有机会释放内存
      if (i + BATCH_SIZE < productsToCompare.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    const extractDuration = Date.now() - extractStartTime;
    
    console.log(`[Dedup] Loaded ${existingImages.length}/${productsToCompare.length} images in ${extractDuration}ms (on-demand loading)`);
    
    if (existingImages.length === 0) {
      console.log("[Dedup] No images to compare, skipping");
      return {
        hasDuplicates: false,
        duplicates: [],
        stats: {
          totalProducts: allProducts.length,
          pHashFiltered: pHashFilteredCount,
          aiCompared: 0,
          durationMs: Date.now() - startTime,
        },
      };
    }
    
    // 6. 调用 AI 批量对比
    console.log("[Dedup] Calling AI batch compare API...");
    const similarResults = await batchCompareImages(
      newImageBase64,
      existingImages,
      threshold
    );
    console.log("[Dedup] AI comparison complete, found", similarResults.length, "similar products");
    
    if (similarResults.length === 0) {
      console.log("[Dedup] No duplicates found");
      return {
        hasDuplicates: false,
        duplicates: [],
        stats: {
          totalProducts: allProducts.length,
          pHashFiltered: pHashFilteredCount,
          aiCompared: existingImages.length,
          durationMs: Date.now() - startTime,
        },
      };
    }
    
    // 7. 构建结果
    const duplicates = similarResults.map((result) => {
      const product = allProducts.find((p) => p.id === result.id);
      if (!product) {
        console.warn(`[Dedup] Product ${result.id} not found in allProducts`);
      }
      return {
        product: product!,
        similarityScore: result.similarityScore,
        analysisNote: result.analysisNote,
      };
    }).filter(d => d.product);
    
    console.log("[Dedup] Found", duplicates.length, "duplicates:");
    duplicates.forEach((d) => {
      console.log(`  - ${d.product.sku}: ${d.similarityScore}% (${d.analysisNote})`);
    });
    
    const durationMs = Date.now() - startTime;
    console.log("[Dedup] ========== Duplicate check complete in", durationMs, "ms ==========");
    
    return {
      hasDuplicates: true,
      duplicates,
      stats: {
        totalProducts: allProducts.length,
        pHashFiltered: pHashFilteredCount,
        aiCompared: existingImages.length,
        durationMs,
      },
    };
  } catch (error: any) {
    console.error("[Dedup] ========== Duplicate check failed ==========");
    console.error("[Dedup] Error type:", error.constructor.name);
    console.error("[Dedup] Error message:", error.message);
    console.error("[Dedup] Error stack:", error.stack);
    
    return {
      hasDuplicates: false,
      duplicates: [],
      error: error.message || "Unknown error",
      stats: {
        totalProducts: 0,
        pHashFiltered: 0,
        aiCompared: 0,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * 计算并保存产品的 pHash（用于新产品入库时）
 * @param product 产品对象
 * @param imageBase64 图片的 Base64 数据
 * @returns 更新后的产品对象（包含 imageHash）
 */
export async function calculateAndSaveProductHash(
  product: Product,
  imageBase64: string
): Promise<Product> {
  if (Platform.OS !== 'web') {
    // 原生平台暂不支持 pHash
    return product;
  }
  
  try {
    console.log("[Dedup] Calculating pHash for product:", product.sku);
    const imageHash = await calculatePHashFromBase64(imageBase64);
    console.log("[Dedup] Product pHash:", imageHash);
    
    return {
      ...product,
      imageHash,
    };
  } catch (error) {
    console.warn("[Dedup] Failed to calculate pHash for product:", error);
    return product;
  }
}
