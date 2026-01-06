/**
 * SKU 重复检测模块
 * 用于检测和警告重复的 SKU
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProductStorage } from "./product-storage";

const DUPLICATE_WARNING_KEY = "sku_duplicate_warnings";

export interface DuplicateSKUWarning {
  sku: string;
  productIds: string[];
  detectedAt: string;
  dismissed: boolean;
}

export interface DuplicateWarningStorage {
  warnings: DuplicateSKUWarning[];
  lastCheckAt: string;
}

/**
 * 扫描所有产品，检测重复的 SKU
 */
export async function scanForDuplicateSKUs(): Promise<DuplicateSKUWarning[]> {
  console.log("[SKU Duplicate Check] Starting scan...");
  
  const products = await ProductStorage.getAll();
  const skuMap = new Map<string, string[]>();
  
  // 统计每个 SKU 对应的产品 ID
  for (const product of products) {
    if (product.isDeleted) continue;
    
    const sku = product.sku?.trim().toUpperCase();
    if (!sku) continue;
    
    const existingIds = skuMap.get(sku) || [];
    existingIds.push(product.id);
    skuMap.set(sku, existingIds);
  }
  
  // 找出重复的 SKU
  const duplicates: DuplicateSKUWarning[] = [];
  const now = new Date().toISOString();
  
  for (const [sku, productIds] of skuMap.entries()) {
    if (productIds.length > 1) {
      duplicates.push({
        sku,
        productIds,
        detectedAt: now,
        dismissed: false,
      });
    }
  }
  
  console.log(`[SKU Duplicate Check] Found ${duplicates.length} duplicate SKUs`);
  
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
