/**
 * SKU 重复检测模块
 * 用于检测和警告重复的 SKU（包括前缀+流水号相同但后缀不同的情况）
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProductStorage } from "./storage";

const DUPLICATE_WARNING_KEY = "sku_duplicate_warnings";

export interface DuplicateSKUWarning {
  sku: string;
  productIds: string[];
  detectedAt: string;
  dismissed: boolean;
  /** 相似的SKU列表（用于显示） */
  similarSkus?: string[];
  /** 匹配的基础SKU（前缀+流水号） */
  baseSku?: string;
}

export interface DuplicateWarningStorage {
  warnings: DuplicateSKUWarning[];
  lastCheckAt: string;
}

/**
 * 从SKU中提取基础部分（前缀+流水号）
 * 例如：
 * - "LB-ED-IR-0009-NT" -> "LB-ED-IR-0009"
 * - "LB-ED-IR-0009" -> "LB-ED-IR-0009"
 * - "LB-ED-IR-0001-BL" -> "LB-ED-IR-0001"
 * 
 * 规则：匹配 XX-XX-XX-NNNN 格式，其中 NNNN 是数字
 */
export function extractBaseSku(sku: string): string {
  if (!sku) return "";
  
  // 标准化：去除空格，转大写
  const normalized = sku.trim().toUpperCase();
  
  // 匹配格式：前缀-前缀-前缀-数字流水号（后面可能还有后缀）
  // 例如：LB-ED-IR-0009 或 LB-ED-IR-0009-NT
  const match = normalized.match(/^([A-Z]+-[A-Z]+-[A-Z]+-\d+)/);
  
  if (match) {
    return match[1];
  }
  
  // 如果不匹配标准格式，返回原始SKU（去除最后一个后缀）
  // 例如：SOME-SKU-001-BL -> SOME-SKU-001
  const parts = normalized.split("-");
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    // 如果最后一部分是纯字母后缀（如BL, NT, RD等），去掉它
    if (/^[A-Z]{1,3}$/.test(lastPart) && parts.length > 2) {
      return parts.slice(0, -1).join("-");
    }
  }
  
  return normalized;
}

/**
 * 扫描所有产品，检测重复的 SKU（包括前缀+流水号相同的情况）
 */
export async function scanForDuplicateSKUs(): Promise<DuplicateSKUWarning[]> {
  console.log("[SKU Duplicate Check] Starting scan...");
  
  const products = await ProductStorage.getAll();
  
  // 使用基础SKU作为key进行分组
  const baseSkuMap = new Map<string, Array<{ id: string; sku: string }>>();
  
  // 统计每个基础SKU对应的产品
  for (const product of products) {
    if (product.isDeleted) continue;
    
    const sku = product.sku?.trim();
    if (!sku) continue;
    
    const baseSku = extractBaseSku(sku);
    if (!baseSku) continue;
    
    const existing = baseSkuMap.get(baseSku) || [];
    existing.push({ id: product.id, sku: sku });
    baseSkuMap.set(baseSku, existing);
  }
  
  // 找出重复的基础SKU
  const duplicates: DuplicateSKUWarning[] = [];
  const now = new Date().toISOString();
  
  for (const [baseSku, items] of baseSkuMap.entries()) {
    if (items.length > 1) {
      // 获取所有相关的SKU
      const skus = items.map(item => item.sku);
      const productIds = items.map(item => item.id);
      
      console.log(`[SKU Duplicate Check] Found similar SKUs for base "${baseSku}":`, skus);
      
      duplicates.push({
        sku: baseSku, // 使用基础SKU作为标识
        productIds,
        detectedAt: now,
        dismissed: false,
        similarSkus: skus,
        baseSku: baseSku,
      });
    }
  }
  
  console.log(`[SKU Duplicate Check] Found ${duplicates.length} duplicate/similar SKU groups`);
  
  // 保存警告
  if (duplicates.length > 0) {
    await saveDuplicateWarnings(duplicates);
  } else {
    // 清空警告
    await clearDuplicateWarnings();
  }
  
  return duplicates;
}

/**
 * 检查新SKU是否与现有SKU冲突
 * @param newSku 新的SKU
 * @param excludeProductId 排除的产品ID（用于编辑时排除自己）
 * @returns 冲突的SKU列表
 */
export async function checkSkuConflict(
  newSku: string,
  excludeProductId?: string
): Promise<{ hasConflict: boolean; conflictingSkus: string[]; conflictingProductIds: string[] }> {
  const products = await ProductStorage.getAll();
  const newBaseSku = extractBaseSku(newSku);
  
  if (!newBaseSku) {
    return { hasConflict: false, conflictingSkus: [], conflictingProductIds: [] };
  }
  
  const conflictingSkus: string[] = [];
  const conflictingProductIds: string[] = [];
  
  for (const product of products) {
    if (product.isDeleted) continue;
    if (excludeProductId && product.id === excludeProductId) continue;
    
    const existingBaseSku = extractBaseSku(product.sku);
    
    if (existingBaseSku === newBaseSku) {
      conflictingSkus.push(product.sku);
      conflictingProductIds.push(product.id);
    }
  }
  
  return {
    hasConflict: conflictingSkus.length > 0,
    conflictingSkus,
    conflictingProductIds,
  };
}

/**
 * 保存重复警告
 */
async function saveDuplicateWarnings(warnings: DuplicateSKUWarning[]): Promise<void> {
  const storage: DuplicateWarningStorage = {
    warnings,
    lastCheckAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(DUPLICATE_WARNING_KEY, JSON.stringify(storage));
}

/**
 * 获取当前的重复警告
 */
export async function getDuplicateWarnings(): Promise<DuplicateSKUWarning[]> {
  try {
    const data = await AsyncStorage.getItem(DUPLICATE_WARNING_KEY);
    if (!data) return [];
    
    const storage: DuplicateWarningStorage = JSON.parse(data);
    // 只返回未被忽略的警告
    return storage.warnings.filter(w => !w.dismissed);
  } catch (error) {
    console.error("[SKU Duplicate Check] Failed to get warnings:", error);
    return [];
  }
}

/**
 * 忽略某个重复警告
 */
export async function dismissDuplicateWarning(sku: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(DUPLICATE_WARNING_KEY);
    if (!data) return;
    
    const storage: DuplicateWarningStorage = JSON.parse(data);
    const warning = storage.warnings.find(w => w.sku === sku);
    if (warning) {
      warning.dismissed = true;
      await AsyncStorage.setItem(DUPLICATE_WARNING_KEY, JSON.stringify(storage));
    }
  } catch (error) {
    console.error("[SKU Duplicate Check] Failed to dismiss warning:", error);
  }
}

/**
 * 清空所有重复警告
 */
export async function clearDuplicateWarnings(): Promise<void> {
  await AsyncStorage.removeItem(DUPLICATE_WARNING_KEY);
}

/**
 * 获取上次检查时间
 */
export async function getLastCheckTime(): Promise<string | null> {
  try {
    const data = await AsyncStorage.getItem(DUPLICATE_WARNING_KEY);
    if (!data) return null;
    
    const storage: DuplicateWarningStorage = JSON.parse(data);
    return storage.lastCheckAt;
  } catch (error) {
    return null;
  }
}
