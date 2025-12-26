/**
 * AI 图片相似度对比结果类型定义
 */

export interface ImageSimilarityResult {
  /** 产品 ID */
  productId: string;
  /** SKU */
  sku: string;
  /** 相似度分数 (0-100) */
  similarityScore: number;
  /** 细节图 URI */
  detailImageUri: string;
  /** 当前库存数量 */
  currentQuantity: number;
  /** 存储位置 */
  location: string;
  /** AI 分析说明 */
  analysisNote: string;
}

/**
 * 查重结果
 */
export interface DuplicateCheckResult {
  /** 是否发现疑似重复 */
  hasDuplicates: boolean;
  /** 疑似重复产品列表（按相似度降序排列） */
  duplicates: ImageSimilarityResult[];
  /** 查重耗时（毫秒） */
  durationMs: number;
}
