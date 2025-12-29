/**
 * 感知哈希 (pHash) 工具函数
 * 用于快速本地图片相似度预筛选，减少 AI API 调用
 */

import { DifferenceHashBuilder, Hash } from "browser-image-hash";

// 汉明距离阈值配置
export const PHASH_THRESHOLDS = {
  VERY_SIMILAR: 5,    // 汉明距离 <= 5: 非常相似，很可能是同一张图
  SIMILAR: 10,        // 汉明距离 <= 10: 相似，需要 AI 进一步确认
  POSSIBLY_SIMILAR: 15, // 汉明距离 <= 15: 可能相似，可选择性 AI 确认
  DIFFERENT: 16,      // 汉明距离 > 15: 不同图片，无需 AI 确认
};

// 缓存 HashBuilder 实例
let hashBuilder: DifferenceHashBuilder | null = null;

/**
 * 获取 HashBuilder 实例（单例模式）
 */
function getHashBuilder(): DifferenceHashBuilder {
  if (!hashBuilder) {
    hashBuilder = new DifferenceHashBuilder();
  }
  return hashBuilder;
}

/**
 * 计算图片的感知哈希值
 * @param imageDataUrl 图片的 Data URL（data:image/...;base64,...）
 * @returns 64 位哈希字符串
 */
export async function calculatePHash(imageDataUrl: string): Promise<string> {
  // 仅在浏览器环境中可用
  if (typeof window === "undefined") {
    throw new Error("pHash calculation is only available in browser environment");
  }

  try {
    const builder = getHashBuilder();
    
    // browser-image-hash 需要 URL 对象或字符串 URL
    // 对于 Data URL，我们需要先创建一个 Blob URL
    const blob = await dataUrlToBlob(imageDataUrl);
    const blobUrl = URL.createObjectURL(blob);
    
    try {
      const hash = await builder.build(new URL(blobUrl));
      return hash.rawHash;
    } finally {
      // 清理 Blob URL
      URL.revokeObjectURL(blobUrl);
    }
  } catch (error) {
    console.error("[pHash] Failed to calculate hash:", error);
    throw error;
  }
}

/**
 * 计算两个哈希值之间的汉明距离
 * @param hash1 第一个哈希值
 * @param hash2 第二个哈希值
 * @returns 汉明距离（0-64）
 */
export function calculateHammingDistance(hash1: string, hash2: string): number {
  const h1 = new Hash(hash1);
  const h2 = new Hash(hash2);
  return h1.getHammingDistance(h2);
}

/**
 * 判断两张图片是否可能相似（基于 pHash）
 * @param hash1 第一个哈希值
 * @param hash2 第二个哈希值
 * @param threshold 汉明距离阈值（默认 15）
 * @returns 是否可能相似
 */
export function isPossiblySimilar(
  hash1: string,
  hash2: string,
  threshold: number = PHASH_THRESHOLDS.POSSIBLY_SIMILAR
): boolean {
  const distance = calculateHammingDistance(hash1, hash2);
  return distance <= threshold;
}

/**
 * 批量筛选可能相似的图片
 * @param newImageHash 新图片的哈希值
 * @param existingHashes 现有图片的哈希值列表 { id, hash }
 * @param threshold 汉明距离阈值（默认 15）
 * @returns 可能相似的图片 ID 列表，按汉明距离升序排列
 */
export function filterSimilarByPHash(
  newImageHash: string,
  existingHashes: Array<{ id: string; hash: string }>,
  threshold: number = PHASH_THRESHOLDS.POSSIBLY_SIMILAR
): Array<{ id: string; distance: number }> {
  const results: Array<{ id: string; distance: number }> = [];

  for (const { id, hash } of existingHashes) {
    const distance = calculateHammingDistance(newImageHash, hash);
    if (distance <= threshold) {
      results.push({ id, distance });
    }
  }

  // 按汉明距离升序排列（越小越相似）
  results.sort((a, b) => a.distance - b.distance);

  return results;
}

/**
 * 将 Data URL 转换为 Blob
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * 从 Base64 计算 pHash（便捷函数）
 * @param base64 图片的 Base64 数据（不含前缀）
 * @param mimeType MIME 类型（默认 image/jpeg）
 * @returns 64 位哈希字符串
 */
export async function calculatePHashFromBase64(
  base64: string,
  mimeType: string = "image/jpeg"
): Promise<string> {
  const dataUrl = `data:${mimeType};base64,${base64}`;
  return calculatePHash(dataUrl);
}
