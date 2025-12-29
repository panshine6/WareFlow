/**
 * 去重处理工具函数
 */

import { Platform } from "react-native";
import { ProductAPI } from "./api-client";
import { ProductStorage } from "./storage";
import { batchCompareImages } from "./ai-vision";
import type { Product } from "@/types/product";

/**
 * 将图片 URI 转换为 Base64（带重试机制）
 */
export async function imageToBase64(uri: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[Image] Converting to base64 (attempt ${i + 1}/${retries}):`, uri);
      
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
}

/**
 * 执行去重检查
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
  try {
    console.log("[Dedup] ========== Starting duplicate check ==========");
    console.log("[Dedup] Detail image URI:", detailImageUri);
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
    // Web 平台使用本地存储，原生平台使用云端 API
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
      };
    }
    
    // 3. 转换现有产品图片为 Base64
    console.log("[Dedup] Converting existing product images to base64...");
    const existingImages: Array<{ id: string; base64: string }> = [];
    
    for (let i = 0; i < allProducts.length; i++) {
      const product = allProducts[i];
      try {
        console.log(`[Dedup] Converting image ${i + 1}/${allProducts.length} (${product.id})...`);
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
      };
    }
    
    // 4. 调用 AI 批量对比
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
      };
    }
    
    // 5. 构建结果
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
    }).filter(d => d.product); // 过滤掉找不到的产品
    
    console.log("[Dedup] Found", duplicates.length, "duplicates:");
    duplicates.forEach((d) => {
      console.log(`  - ${d.product.sku}: ${d.similarityScore}% (${d.analysisNote})`);
    });
    
    console.log("[Dedup] ========== Duplicate check complete ==========");
    
    return {
      hasDuplicates: true,
      duplicates,
    };
  } catch (error: any) {
    console.error("[Dedup] ========== Duplicate check failed ==========");
    console.error("[Dedup] Error type:", error.constructor.name);
    console.error("[Dedup] Error message:", error.message);
    console.error("[Dedup] Error stack:", error.stack);
    console.error("[Dedup] Detail image URI:", detailImageUri);
    
    return {
      hasDuplicates: false,
      duplicates: [],
      error: error.message || "Unknown error",
    };
  }
}
