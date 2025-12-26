/**
 * 库存历史记录条目
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

/**
 * 产品记录数据类型
 */
export interface Product {
  /** 唯一标识 */
  id: string;
  /** 产品细节照片 URI */
  detailImageUri: string;
  /** 产品全景照片 URI */
  overviewImageUri: string;
  /** SKU 编号 */
  sku: string;
  /** 库存数量 */
  quantity: number;
  /** 存储位置 */
  storageLocation: string;
  /** 入库时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt?: string;
  /** 操作员名称 */
  operatorName?: string;
  /** 操作员 ID */
  operatorId?: string;
  /** 入库历史记录列表 */
  history?: InventoryHistoryEntry[];
  /** 是否已删除（软删除标记） */
  isDeleted?: boolean;
  /** 删除时间 */
  deletedAt?: string;
}

/**
 * 应用设置数据类型
 */
export interface AppSettings {
  /** 上次输入的 SKU */
  lastSku: string;
  /** 默认存储位置 */
  defaultLocation: string;
}
