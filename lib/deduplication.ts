/**
 * 去重处理工具函数
 * 使用 pHash 预筛选 + AI 精确对比的两阶段策略
 */

import { Platform } from "react-native";
import { ProductAPI } from "./api-client";
import { ProductStorage } from "./storage";
import { batchCompareImages } from "./ai-vision";
import { calculatePHashFromBase64, filterSimilarByPHash, PHASH_THRESHOLDS } from "./phash";
import { getImageBase64WithCache, imageCache } from "./image-cache";
import type { Product } from "@/types/product";

// 放宽 pHash 阈值，避免漏掉相似产品
const PHASH_THRESHOLD_FOR_DEDUP = 25; // 汉明距离阈值，越大越宽松

/**
 * 将图片 URI 转换为 Base64（带重试机制）
 */
export async function imageToBase64(uri: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[Image] Converting to base64 (attempt ${i + 1}/${retries}):`, uri.substring(0, 50) + "...");
      
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
      console.error(`[Image] Conversion failed (attempt ${i + 1}):`, error);
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
 * @param detailImageUri 新拍摄的细节图 URI
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
    console.log("[Dedup] Detail image URI:", detailImageUri.substring(0, 50) + "...");
    console.log("[Dedup] Has base64:", !!detailImageBase64);
    console.log("[Dedup] Threshold:", threshold);
    
    // 1. 转换新图片为 Base64（如果没有提供）
    let newImageBase64 = detailImageBase64;
    if (!newImageBase64) {
      console.log("[Dedup] Converting new image to base64...");
      newImageBase64 = await imageToBase64(detailImageUri);
      console.log("[Dedup] Conversion successful, base64 length:", newImageBase64.length);
    }
    
    // 2. 获取所有活跃产品
    const isWeb = Platform.OS === 'web';
    console.log("[Dedup] Loading active products from", isWeb ? "local storage" : "cloud", "...");
    const allProducts = isWeb 
      ? await ProductStorage.getActive()
      : await ProductAPI.getActive();
    console.log("[Dedup] Loaded", allProducts.length, "active products");
    
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
    
    // 5. 转换候选产品图片为 Base64（使用缓存加速）
    console.log("[Dedup] Converting candidate product images to base64 (with cache)...");
    const existingImages: Array<{ id: string; base64: string }> = [];
    
    // 并行获取图片（带缓存）
    const BATCH_SIZE = 10; // 并行获取数量
    for (let i = 0; i < productsToCompare.length; i += BATCH_SIZE) {
      const batch = productsToCompare.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (product) => {
          try {
            // 使用缓存获取 Base64
            const base64WithPrefix = await getImageBase64WithCache(product.detailImageUri);
            // 移除 data:image/...;base64, 前缀
            const base64 = base64WithPrefix.includes(',') 
              ? base64WithPrefix.split(',')[1] 
              : base64WithPrefix;
            return { id: product.id, base64, sku: product.sku };
          } catch (error: any) {
            console.error(`[Dedup] Failed to get image for product ${product.id}:`, error);
            return null;
          }
        })
      );
      
      // 过滤掉失败的
      for (const result of batchResults) {
        if (result) {
          existingImages.push({ id: result.id, base64: result.base64 });
        }
      }
      
      console.log(`[Dedup] Converted ${Math.min(i + BATCH_SIZE, productsToCompare.length)}/${productsToCompare.length} images`);
    }
    
    console.log("[Dedup] Successfully converted", existingImages.length, "images (with cache)");
    
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
