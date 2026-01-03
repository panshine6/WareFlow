/**
 * Box（箱子）相关类型定义
 * Box 用于将多个产品打包在一起，便于批量出库
 */

/**
 * Box 状态
 */
export type BoxStatus = 'open' | 'closed';

/**
 * Box 内的产品项
 */
export interface BoxItem {
  /** 产品 ID */
  productId: string;
  /** 用户 SKU */
  sku: string;
  /** 系统 SKU */
  systemSku?: string;
  /** 数量 */
  quantity: number;
  /** 添加时间 */
  addedAt: string;
}

/**
 * Box（箱子）数据结构
 */
export interface Box {
  /** Box 唯一标识（格式：XX-XX-XX-Box-N，如 LB-RF-GM-Box-1） */
  id: string;
  /** Box 名称（与 ID 相同） */
  name: string;
  /** 存储位置（如 Shelf 1） */
  location: string;
  /** Box 内的产品列表 */
  items: BoxItem[];
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** Box 状态：open（可添加）/ closed（已封箱） */
  status: BoxStatus;
  /** 创建者 ID */
  operatorId: number;
  /** 创建者名称 */
  operatorName: string;
  /** 备注 */
  notes?: string;
}

/**
 * 创建 Box 的输入参数
 */
export interface CreateBoxInput {
  /** Box 名称前缀（如 LB-RF-GM），系统会自动添加 -Box-N */
  prefix: string;
  /** 存储位置 */
  location: string;
  /** 操作员 ID */
  operatorId: number;
  /** 操作员名称 */
  operatorName: string;
  /** 备注 */
  notes?: string;
}

/**
 * 添加产品到 Box 的输入参数
 */
export interface AddItemToBoxInput {
  /** Box ID */
  boxId: string;
  /** 产品 ID */
  productId: string;
  /** 用户 SKU */
  sku: string;
  /** 系统 SKU */
  systemSku?: string;
  /** 数量 */
  quantity: number;
}
