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
  threshold: number = 90
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
    
    // 3. 计算新图片的 pHash
    let newImageHash: string | null = null;
    let pHashFilteredProducts: Product[] = allProducts;
    
    if (isWeb) {
      try {
        console.log("[Dedup] Calculating pHash for new image...");
        newImageHash = await calculatePHashFromBase64(newImageBase64);
        console.log("[Dedup] New image pHash:", newImageHash);
        
        // 4. 使用 pHash 预筛选
        const productsWithHash = allProducts.filter(p => p.imageHash);
        console.log("[Dedup] Products with pHash:", productsWithHash.length, "/", allProducts.length);
        
        if (productsWithHash.length > 0) {
          const existingHashes = productsWithHash.map(p => ({
            id: p.id,
            hash: p.imageHash!,
          }));
          
          const similarByPHash = filterSimilarByPHash(
            newImageHash,
            existingHashes,
            PHASH_THRESHOLDS.POSSIBLY_SIMILAR
          );
          
          console.log("[Dedup] pHash pre-filter results:", similarByPHash.length, "potentially similar");
          similarByPHash.forEach(({ id, distance }) => {
            const product = allProducts.find(p => p.id === id);
            console.log(`  - ${product?.sku || id}: distance=${distance}`);
          });
          
          // 只对 pHash 筛选出的产品进行 AI 对比
          const filteredIds = new Set(similarByPHash.map(r => r.id));
          // 同时包含没有 pHash 的产品（需要 AI 对比）
          const productsWithoutHash = allProducts.filter(p => !p.imageHash);
          
          pHashFilteredProducts = [
            ...allProducts.filter(p => filteredIds.has(p.id)),
            ...productsWithoutHash,
          ];
          
          console.log("[Dedup] Products to compare with AI:", pHashFilteredProducts.length);
        }
      } catch (error) {
        console.warn("[Dedup] pHash calculation failed, falling back to full AI comparison:", error);
        // pHash 失败时回退到全量 AI 对比
      }
    }
    
    // 5. 如果 pHash 筛选后没有候选产品，直接返回
    if (pHashFilteredProducts.length === 0) {
      console.log("[Dedup] No candidates after pHash filter, no duplicates");
      return {
        hasDuplicates: false,
        duplicates: [],
        stats: {
          totalProducts: allProducts.length,
          pHashFiltered: allProducts.length,
          aiCompared: 0,
          durationMs: Date.now() - startTime,
        },
      };
    }
    
    // 6. 转换候选产品图片为 Base64
    console.log("[Dedup] Converting candidate product images to base64...");
    const existingImages: Array<{ id: string; base64: string }> = [];
    
    for (let i = 0; i < pHashFilteredProducts.length; i++) {
      const product = pHashFilteredProducts[i];
      try {
        console.log(`[Dedup] Converting image ${i + 1}/${pHashFilteredProducts.length} (${product.sku})...`);
        const base64 = await imageToBase64(product.detailImageUri);
        existingImages.push({
          id: product.id,
          base64,
        });
      } catch (error: any) {
        console.error(`[Dedup] Failed to convert image for product ${product.id}:`, error);
        // 跳过这个产品，继续处理其他产品
      }
    }
    
    console.log("[Dedup] Successfully converted", existingImages.length, "images");
    
    if (existingImages.length === 0) {
      console.log("[Dedup] No images to compare, skipping");
      return {
        hasDuplicates: false,
        duplicates: [],
        stats: {
          totalProducts: allProducts.length,
          pHashFiltered: allProducts.length - pHashFilteredProducts.length,
          aiCompared: 0,
          durationMs: Date.now() - startTime,
        },
      };
    }
    
    // 7. 调用 AI 批量对比
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
          pHashFiltered: allProducts.length - pHashFilteredProducts.length,
          aiCompared: existingImages.length,
          durationMs: Date.now() - startTime,
        },
      };
    }
    
    // 8. 构建结果
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
        pHashFiltered: allProducts.length - pHashFilteredProducts.length,
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
