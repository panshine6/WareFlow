import type { Product } from "@/types/product";
import * as XLSX from 'xlsx';

/**
 * 导出产品数据为店小秘格式的 Excel 文件（优化版本，不含图片）
 * 
 * 性能优化说明：
 * 1. 移除图片导出功能，避免大量图片转 base64 的耗时操作
 * 2. 使用轻量级的 SheetJS (xlsx) 库替代 ExcelJS
 * 3. 一次性构建数据数组，而不是逐行添加
 * 4. 直接生成 Blob 并下载，无需中间文件操作
 */
export async function exportToExcel(products: Product[]): Promise<void> {
  try {
    console.log(`[ExcelExport] Starting export for ${products.length} products...`);
    const startTime = Date.now();
    
    // 构建数据数组（表头 + 数据行）
    const data: (string | number)[][] = [
      ['SKU', '产品标题', '库存数量', '价格(USD)', '存储位置', 'Box', '创建时间'],
    ];
    
    // 一次性添加所有数据行
    for (const product of products) {
      data.push([
        product.sku || '',
        `约饰品:${product.sku || ''}`,
        product.quantity || 0,
        product.price || '',
        product.storageLocation || '',
        product.boxName || '未关联',
        new Date(product.createdAt).toLocaleString('zh-CN'),
      ]);
    }
    
    console.log(`[ExcelExport] Data prepared in ${Date.now() - startTime}ms`);
    
    // 创建工作簿和工作表
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // 设置列宽
    ws['!cols'] = [
      { wch: 25 }, // SKU
      { wch: 30 }, // 产品标题
      { wch: 12 }, // 库存数量
      { wch: 12 }, // 价格
      { wch: 15 }, // 存储位置
      { wch: 18 }, // Box
      { wch: 20 }, // 创建时间
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, '产品库存');
    
    // 生成 Excel 文件
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    console.log(`[ExcelExport] Excel generated in ${Date.now() - startTime}ms`);
    
    // 下载文件（Web 端）
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `饰品库存_${timestamp}.xlsx`;
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`[ExcelExport] Export completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[ExcelExport] Excel export failed:', error);
    throw error;
  }
}

/**
 * 生成店小秘兼容格式的 Excel（优化版本）
 * 
 * 此函数是 exportToExcel 的别名，保持 API 兼容性
 */
export async function exportToDianxiaomiFormat(
  products: Product[],
): Promise<void> {
  return exportToExcel(products);
}


// ============================================
// NIIMBOT 标签打印 Excel 导出功能
// ============================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProductStorage } from './storage';

// 导出记录存储键
const EXPORTED_LABELS_KEY = 'exported_labels';

/**
 * 获取已导出的标签记录
 * 返回一个 Set，包含已导出的标签唯一标识（id-inboundTime）
 */
export async function getExportedLabels(): Promise<Set<string>> {
  try {
    const data = await AsyncStorage.getItem(EXPORTED_LABELS_KEY);
    if (!data) return new Set();
    return new Set(JSON.parse(data));
  } catch (error) {
    console.error('[ExcelExport] Failed to get exported labels:', error);
    return new Set();
  }
}

/**
 * 记录已导出的标签
 * @param labelKeys 标签唯一标识列表（id-inboundTime）
 */
export async function markLabelsAsExported(labelKeys: string[]): Promise<void> {
  try {
    const existing = await getExportedLabels();
    for (const key of labelKeys) {
      existing.add(key);
    }
    await AsyncStorage.setItem(EXPORTED_LABELS_KEY, JSON.stringify([...existing]));
  } catch (error) {
    console.error('[ExcelExport] Failed to mark labels as exported:', error);
  }
}

/**
 * 清除导出记录（可选，用于清理旧数据）
 */
export async function clearExportedLabels(): Promise<void> {
  try {
    await AsyncStorage.removeItem(EXPORTED_LABELS_KEY);
  } catch (error) {
    console.error('[ExcelExport] Failed to clear exported labels:', error);
  }
}

// 待打印标签项
export interface LabelItem {
  id: string;
  systemSku: string;
  userSku: string;
  productName?: string;
  quantity: number;
  inboundTime: number;
  /** 是否已导出过 */
  exported?: boolean;
}

// 批次分组结果
export interface BatchGroup {
  startTime: number;
  endTime: number;
  items: LabelItem[];
  isSameBatch: boolean;
}

/**
 * 获取最近入库的商品列表
 * @param hours 最近多少小时内的入库记录，默认 24 小时
 * 
 * 优化逻辑：
 * 1. 优先使用 history 中的入库记录
 * 2. 如果没有入库历史，则使用产品的 createdAt 时间作为入库时间
 * 3. 支持没有 systemSku 的产品（使用 sku 作为 systemSku）
 */
export async function getRecentInboundProducts(hours: number = 24): Promise<LabelItem[]> {
  const allProducts = await ProductStorage.getAll();
  const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
  
  const recentItems: LabelItem[] = [];
  const processedProductIds = new Set<string>(); // 避免重复添加
  
  for (const product of allProducts) {
    // 跳过已删除的产品
    if (product.isDeleted) continue;
    
    // 获取系统 SKU（如果没有则使用普通 SKU）
    const systemSku = product.systemSku || product.sku;
    if (!systemSku) continue;
    
    // 获取最近的入库记录
    const inboundHistory = (product.history || []).filter(
      h => h.type === 'inbound' && new Date(h.timestamp).getTime() >= cutoffTime
    );
    
    if (inboundHistory.length > 0) {
      // 有入库历史记录，使用历史记录
      for (const entry of inboundHistory) {
        const itemKey = `${product.id}-${entry.timestamp}`;
        if (!processedProductIds.has(itemKey)) {
          processedProductIds.add(itemKey);
          recentItems.push({
            id: product.id,
            systemSku: systemSku,
            userSku: product.sku || '',
            productName: product.sku,
            quantity: entry.quantity,
            inboundTime: new Date(entry.timestamp).getTime(),
          });
        }
      }
    } else {
      // 没有入库历史，检查 createdAt 是否在时间范围内
      const createdTime = new Date(product.createdAt).getTime();
      if (createdTime >= cutoffTime && !processedProductIds.has(product.id)) {
        processedProductIds.add(product.id);
        recentItems.push({
          id: product.id,
          systemSku: systemSku,
          userSku: product.sku || '',
          productName: product.sku,
          quantity: product.quantity,
          inboundTime: createdTime,
        });
      }
    }
  }
  
  // 按入库时间降序排列
  recentItems.sort((a, b) => b.inboundTime - a.inboundTime);
  
  // 获取已导出记录，标记已导出的标签
  const exportedLabels = await getExportedLabels();
  for (const item of recentItems) {
    const labelKey = `${item.id}-${item.inboundTime}`;
    item.exported = exportedLabels.has(labelKey);
  }
  
  return recentItems;
}

/**
 * 将商品按入库时间分组（识别同一批次）
 * @param items 商品列表
 * @param batchIntervalMinutes 同一批次的时间间隔（分钟），默认 30 分钟
 */
export function groupByBatch(items: LabelItem[], batchIntervalMinutes: number = 30): BatchGroup[] {
  if (items.length === 0) return [];
  
  const batchIntervalMs = batchIntervalMinutes * 60 * 1000;
  const groups: BatchGroup[] = [];
  
  // 按时间排序
  const sortedItems = [...items].sort((a, b) => a.inboundTime - b.inboundTime);
  
  let currentGroup: BatchGroup = {
    startTime: sortedItems[0].inboundTime,
    endTime: sortedItems[0].inboundTime,
    items: [sortedItems[0]],
    isSameBatch: true,
  };
  
  for (let i = 1; i < sortedItems.length; i++) {
    const item = sortedItems[i];
    const timeDiff = item.inboundTime - currentGroup.endTime;
    
    if (timeDiff <= batchIntervalMs) {
      // 属于同一批次
      currentGroup.items.push(item);
      currentGroup.endTime = item.inboundTime;
    } else {
      // 新批次
      groups.push(currentGroup);
      currentGroup = {
        startTime: item.inboundTime,
        endTime: item.inboundTime,
        items: [item],
        isSameBatch: true,
      };
    }
  }
  
  // 添加最后一组
  groups.push(currentGroup);
  
  // 标记只有一个商品的批次
  for (const group of groups) {
    group.isSameBatch = group.items.length > 1;
  }
  
  // 按时间倒序排列（最近的在前面）
  groups.reverse();
  
  // 每个批次内的商品也按时间倒序排列
  for (const group of groups) {
    group.items.sort((a, b) => b.inboundTime - a.inboundTime);
  }
  
  return groups;
}

/**
 * 生成 NIIMBOT APP 可导入的 Excel 文件
 * @param items 要导出的商品列表
 * @returns Excel 文件的 Blob
 * 
 * 注意：每个公司 SKU 只导出一条记录，不按数量重复
 * 因为同一产品只需要一个标签
 */
export function generateNiimbotExcel(items: LabelItem[]): Blob {
  // 创建工作表数据
  // 第一行：列标题
  const data: (string | number)[][] = [
    ['系统SKU', '公司SKU'],
  ];
  
  // 使用 Set 去重，每个公司 SKU 只导出一条记录
  const processedSkus = new Set<string>();
  
  // 添加数据行
  for (const item of items) {
    // 使用公司 SKU 作为去重键，如果没有公司 SKU 则使用系统 SKU
    const dedupeKey = item.userSku || item.systemSku;
    
    // 跳过已处理过的 SKU
    if (processedSkus.has(dedupeKey)) {
      continue;
    }
    processedSkus.add(dedupeKey);
    
    // 每个 SKU 只添加一条记录
    data.push([item.systemSku, item.userSku]);
  }
  
  // 创建工作簿
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // 设置列宽
  ws['!cols'] = [
    { wch: 20 }, // 系统SKU
    { wch: 20 }, // 公司SKU
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, '标签数据');
  
  // 生成 Excel 文件
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * 下载 Excel 文件（Web 端）
 * @param blob Excel 文件的 Blob
 * @param filename 文件名
 */
export function downloadExcelWeb(blob: Blob, filename: string = 'niimbot_labels.xlsx'): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 一键导出最近入库商品的标签 Excel
 * @param items 选中的商品列表
 * @returns 导出的标签唯一标识列表，用于标记已导出
 */
export async function exportLabelsToExcel(items: LabelItem[]): Promise<string[]> {
  if (items.length === 0) {
    throw new Error('没有选中任何商品');
  }
  
  const blob = generateNiimbotExcel(items);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `niimbot_labels_${timestamp}.xlsx`;
  downloadExcelWeb(blob, filename);
  
  // 记录已导出的标签
  const exportedKeys = items.map(item => `${item.id}-${item.inboundTime}`);
  await markLabelsAsExported(exportedKeys);
  
  return exportedKeys;
}

/**
 * 格式化时间显示
 */
export function formatLabelTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 格式化批次时间范围
 */
export function formatBatchTimeRange(group: BatchGroup): string {
  const start = formatLabelTime(group.startTime);
  const end = formatLabelTime(group.endTime);
  
  if (start === end) {
    return start;
  }
  
  return `${start} - ${end}`;
}
