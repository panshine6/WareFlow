/**
 * 库存历史记录类型定义
 * 用于追溯每次入库操作的详细信息
 */

export interface InventoryHistoryEntry {
  /** 历史记录 ID */
  id: string;
  /** 入库时间 */
  timestamp: string;
  /** 操作员 ID */
  operatorId: string;
  /** 操作员姓名 */
  operatorName: string;
  /** 本次入库数量 */
  quantity: number;
  /** 存储位置 */
  location: string;
  /** 细节图 URI */
  detailImageUri: string;
  /** 全景图 URI */
  overviewImageUri: string;
  /** 备注 */
  notes?: string;
}

export interface ProductWithHistory {
  /** 产品 ID */
  id: string;
  /** SKU */
  sku: string;
  /** 当前总库存数量 */
  totalQuantity: number;
  /** 主存储位置（最新一次入库的位置） */
  primaryLocation: string;
  /** 主细节图（最新一次入库的细节图） */
  primaryDetailImage: string;
  /** 主全景图（最新一次入库的全景图） */
  primaryOverviewImage: string;
  /** 创建时间（首次入库时间） */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** 入库历史记录列表 */
  history: InventoryHistoryEntry[];
}

/**
 * AI 图片相似度对比结果
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
