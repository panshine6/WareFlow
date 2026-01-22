import type { Product } from "@/types/product";

// ============================================
// 图片压缩工具函数
// ============================================

/**
 * 将 base64 图片压缩到指定尺寸
 * @param base64 原始 base64 图片数据（可以是 Data URL 或纯 base64）
 * @param maxSize 最大尺寸（宽高），默认 100 像素
 * @param quality JPEG 质量，默认 0.6
 * @returns 压缩后的 base64 数据（纯 base64，不含 Data URL 前缀）
 */
async function compressImage(
  base64: string,
  maxSize: number = 100,
  quality: number = 0.6
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // 确保是完整的 Data URL
      let dataUrl = base64;
      if (!base64.startsWith('data:')) {
        dataUrl = `data:image/jpeg;base64,${base64}`;
      }

      const img = new Image();
      img.onload = () => {
        try {
          // 计算缩放比例，保持宽高比
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxSize) {
              height = Math.round(height * maxSize / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round(width * maxSize / height);
              height = maxSize;
            }
          }

          // 创建 Canvas 进行压缩
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // 绘制图片
          ctx.drawImage(img, 0, 0, width, height);

          // 导出为 JPEG（更小的文件大小）
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          
          // 提取纯 base64 数据
          const base64Data = compressedDataUrl.split(',')[1];
          resolve(base64Data);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = dataUrl;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 并行压缩多张图片
 * @param images 图片数组，每个元素包含 id 和 base64
 * @param concurrency 并发数，默认 5（降低并发以减少内存压力）
 * @param onProgress 进度回调
 * @returns 压缩后的图片 Map
 */
async function compressImagesParallel(
  images: Array<{ id: string; base64: string }>,
  concurrency: number = 5,
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  
  // 分批处理
  for (let i = 0; i < images.length; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    const promises = batch.map(async ({ id, base64 }) => {
      try {
        const compressed = await compressImage(base64);
        return { id, compressed };
      } catch (error) {
        console.warn(`[ExcelExport] Failed to compress image for ${id}:`, error);
        return { id, compressed: '' };
      }
    });
    
    const results = await Promise.all(promises);
    for (const { id, compressed } of results) {
      if (compressed) {
        result.set(id, compressed);
      }
    }
    
    // 报告进度
    onProgress?.(Math.min(i + concurrency, images.length), images.length);
  }
  
  return result;
}

// ============================================
// Excel 导出功能（使用动态导入减少初始加载内存）
// ============================================

/**
 * 导出产品数据为店小秘格式的 Excel 文件（带压缩图片）
 * 
 * 性能优化说明：
 * 1. 使用动态导入 ExcelJS，避免初始加载时占用内存
 * 2. 图片压缩到 100x100 像素，约 10-20KB
 * 3. 并行压缩图片，提高处理速度
 * 4. 支持分批导出，避免内存溢出
 * 5. 显示进度信息
 */
export async function exportToExcel(
  products: Product[],
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  try {
    const startTime = Date.now();
    console.log(`[ExcelExport] Starting export for ${products.length} products with images...`);
    onProgress?.(0, `准备导出 ${products.length} 个产品...`);
    
    // 1. 动态导入 ExcelJS（减少初始加载内存）
    onProgress?.(5, '正在加载 Excel 库...');
    const ExcelJS = await import('exceljs');
    console.log(`[ExcelExport] ExcelJS loaded in ${Date.now() - startTime}ms`);
    
    // 2. 准备图片数据
    onProgress?.(10, '正在压缩图片...');
    const imagesToCompress: Array<{ id: string; base64: string }> = [];
    
    for (const product of products) {
      if (product.detailImageUri) {
        imagesToCompress.push({
          id: product.id,
          base64: product.detailImageUri,
        });
      }
    }
    
    console.log(`[ExcelExport] Compressing ${imagesToCompress.length} images...`);
    const compressedImages = await compressImagesParallel(
      imagesToCompress,
      5, // 降低并发数以减少内存压力
      (current, total) => {
        const progress = 10 + Math.round((current / total) * 40);
        onProgress?.(progress, `处理图片 ${current}/${total}`);
      }
    );
    console.log(`[ExcelExport] Compressed ${compressedImages.size} images in ${Date.now() - startTime}ms`);
    
    onProgress?.(50, '正在生成 Excel 文件...');
    
    // 3. 创建工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('产品库存');
    
    // 4. 设置列
    worksheet.columns = [
      { header: '图片', key: 'image', width: 15 },
      { header: 'SKU', key: 'sku', width: 25 },
      { header: '产品标题', key: 'title', width: 30 },
      { header: '库存数量', key: 'quantity', width: 12 },
      { header: '价格(USD)', key: 'price', width: 12 },
      { header: '存储位置', key: 'location', width: 15 },
      { header: 'Box', key: 'box', width: 18 },
      { header: '创建时间', key: 'createdAt', width: 20 },
    ];
    
    // 设置表头样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;
    
    // 5. 添加数据行
    let rowIndex = 2;
    for (const product of products) {
      const row = worksheet.addRow({
        image: '', // 图片列留空，后面添加
        sku: product.sku || '',
        title: `约饰品:${product.sku || ''}`,
        quantity: product.quantity || 0,
        price: product.price || '',
        location: product.storageLocation || '',
        box: product.boxName || '未关联',
        createdAt: new Date(product.createdAt).toLocaleString('zh-CN'),
      });
      
      // 设置行高以容纳图片
      row.height = 80;
      row.alignment = { vertical: 'middle' };
      
      // 添加图片
      const compressedImage = compressedImages.get(product.id);
      if (compressedImage) {
        try {
          const imageId = workbook.addImage({
            base64: compressedImage,
            extension: 'jpeg',
          });
          
          worksheet.addImage(imageId, {
            tl: { col: 0, row: rowIndex - 1 },
            ext: { width: 75, height: 75 },
          });
        } catch (error) {
          console.warn(`[ExcelExport] Failed to add image for ${product.id}:`, error);
        }
      }
      
      rowIndex++;
      
      // 更新进度
      if (rowIndex % 50 === 0) {
        const progress = 50 + Math.round((rowIndex / products.length) * 40);
        onProgress?.(progress, `正在处理第 ${rowIndex - 1}/${products.length} 个产品...`);
      }
    }
    
    onProgress?.(90, '正在生成文件...');
    
    // 6. 生成 Excel 文件
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    
    // 7. 下载文件
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
    
    onProgress?.(100, '导出完成！');
    console.log(`[ExcelExport] Export completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[ExcelExport] Excel export failed:', error);
    throw error;
  }
}

/**
 * 分批导出产品数据
 * @param products 所有产品
 * @param batchIndex 批次索引（从 0 开始）
 * @param batchSize 每批数量，默认 100
 * @param onProgress 进度回调
 */
export async function exportToExcelBatch(
  products: Product[],
  batchIndex: number,
  batchSize: number = 100,
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  const start = batchIndex * batchSize;
  const end = Math.min(start + batchSize, products.length);
  const batchProducts = products.slice(start, end);
  
  const totalBatches = Math.ceil(products.length / batchSize);
  console.log(`[ExcelExport] Exporting batch ${batchIndex + 1}/${totalBatches} (${batchProducts.length} products)`);
  
  return exportToExcel(batchProducts, onProgress);
}

/**
 * 计算分批信息
 * @param totalCount 总产品数
 * @param batchSize 每批数量
 * @returns 批次信息数组
 */
export function calculateBatches(
  totalCount: number,
  batchSize: number = 100
): Array<{ index: number; start: number; end: number; count: number }> {
  const batches: Array<{ index: number; start: number; end: number; count: number }> = [];
  const totalBatches = Math.ceil(totalCount / batchSize);
  
  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, totalCount);
    batches.push({
      index: i,
      start: start + 1, // 显示用，从 1 开始
      end,
      count: end - start,
    });
  }
  
  return batches;
}

/**
 * 生成店小秘兼容格式的 Excel（带图片）
 * 
 * 此函数是 exportToExcel 的别名，保持 API 兼容性
 */
export async function exportToDianxiaomiFormat(
  products: Product[],
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  return exportToExcel(products, onProgress);
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
 * 生成 NIIMBOT APP 可导入的 Excel 文件（使用动态导入）
 * @param items 要导出的商品列表
 * @returns Excel 文件的 Blob
 * 
 * 注意：每个公司 SKU 只导出一条记录，不按数量重复
 * 因为同一产品只需要一个标签
 */
export async function generateNiimbotExcel(items: LabelItem[]): Promise<Blob> {
  // 动态导入 xlsx 库
  const XLSX = await import('xlsx');
  
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
  
  const blob = await generateNiimbotExcel(items);
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
