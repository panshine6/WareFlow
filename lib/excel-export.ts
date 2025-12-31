import ExcelJS from "exceljs";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { Product } from "@/types/product";

/**
 * 将图片 URI 转换为 base64
 */
async function imageUriToBase64(uri: string): Promise<string> {
  try {
    // 使用 fetch 读取图片文件
    const response = await fetch(uri);
    const blob = await response.blob();
    
    // 将 blob 转换为 base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // 移除 data:image/xxx;base64, 前缀
        const base64Data = result.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    return base64;
  } catch (error) {
    console.error("Failed to convert image to base64:", error);
    throw error;
  }
}

/**
 * 获取图片扩展名
 */
function getImageExtension(uri: string): "jpeg" | "png" | "gif" {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.endsWith(".png")) return "png";
  if (lowerUri.endsWith(".gif")) return "gif";
  return "jpeg"; // 默认为 jpeg
}

/**
 * 导出产品数据为店小秘格式的 Excel 文件
 */
export async function exportToExcel(products: Product[]): Promise<void> {
  try {
    // 创建工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("产品");

    // 设置默认行高（为图片预留空间）
    worksheet.properties.defaultRowHeight = 80;

    // 定义列
    worksheet.columns = [
      { header: "SKU", key: "sku", width: 20 },
      { header: "产品标题", key: "title", width: 30 },
      { header: "产品图片", key: "image", width: 15 },
      { header: "库存数量", key: "quantity", width: 12 },
      { header: "价格(USD)", key: "price", width: 12 },
      { header: "存储位置", key: "location", width: 20 },
    ];

    // 设置表头样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // 添加数据和图片
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const rowNumber = i + 2; // 从第2行开始（第1行是表头）

      // 添加行数据
      worksheet.addRow({
        sku: product.sku,
        title: `约饰品:${product.sku}`,
        image: "", // 图片列留空，稍后插入图片
        quantity: product.quantity,
        price: "", // 价格留空，根据店小秘要求调整
        location: product.storageLocation,
      });

      // 插入细节图片（第一张照片）
      if (product.detailImageUri) {
        try {
          const base64 = await imageUriToBase64(product.detailImageUri);
          const extension = getImageExtension(product.detailImageUri);

          const imageId = workbook.addImage({
            base64,
            extension,
          });

          // 将图片添加到单元格（C列，产品图片列）
          worksheet.addImage(imageId, {
            tl: { col: 2, row: rowNumber - 1 }, // C列（索引2），对应行
            ext: { width: 80, height: 80 },
          });
        } catch (error) {
          console.error(
            `Failed to add image for product ${product.sku}:`,
            error,
          );
        }
      }
    }

    // 生成 Excel 文件
    const buffer = await workbook.xlsx.writeBuffer();
    const uint8Array = new Uint8Array(buffer);

    // 保存到文件系统
    const timestamp = new Date().getTime();
    const fileName = `饰品入库_${timestamp}.xlsx`;
    const file = new File(Paths.cache, fileName);
    
    // 写入二进制数据
    await file.write(uint8Array);

    // 分享文件
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dialogTitle: "导出产品数据",
        UTI: "com.microsoft.excel.xlsx",
      });
    } else {
      throw new Error("分享功能不可用");
    }
  } catch (error) {
    console.error("Excel export failed:", error);
    throw error;
  }
}

/**
 * 生成店小秘兼容格式的 Excel（包含额外字段）
 */
export async function exportToDianxiaomiFormat(
  products: Product[],
): Promise<void> {
  // 使用相同的导出逻辑
  return exportToExcel(products);
}


// ============================================
// NIIMBOT 标签打印 Excel 导出功能
// ============================================

import * as XLSX from 'xlsx';
import { ProductStorage } from './storage';

// 待打印标签项
export interface LabelItem {
  id: string;
  systemSku: string;
  userSku: string;
  productName?: string;
  quantity: number;
  inboundTime: number;
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
 */
export async function getRecentInboundProducts(hours: number = 24): Promise<LabelItem[]> {
  const allProducts = await ProductStorage.getAll();
  const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
  
  const recentItems: LabelItem[] = [];
  
  for (const product of allProducts) {
    // 检查是否有系统 SKU
    if (!product.systemSku) continue;
    
    // 获取最近的入库记录
    const inboundHistory = (product.history || []).filter(
      h => h.type === 'inbound' && new Date(h.timestamp).getTime() >= cutoffTime
    );
    
    for (const entry of inboundHistory) {
      recentItems.push({
        id: product.id,
        systemSku: product.systemSku,
        userSku: product.sku || '',
        productName: product.sku, // 使用 sku 作为名称
        quantity: entry.quantity,
        inboundTime: new Date(entry.timestamp).getTime(),
      });
    }
  }
  
  // 按入库时间降序排列
  recentItems.sort((a, b) => b.inboundTime - a.inboundTime);
  
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
  
  return groups;
}

/**
 * 生成 NIIMBOT APP 可导入的 Excel 文件
 * @param items 要导出的商品列表
 * @returns Excel 文件的 Blob
 */
export function generateNiimbotExcel(items: LabelItem[]): Blob {
  // 创建工作表数据
  // 第一行：列标题
  const data: (string | number)[][] = [
    ['系统SKU', '公司SKU'],
  ];
  
  // 添加数据行
  for (const item of items) {
    // 每个商品可能需要打印多张标签（根据数量）
    for (let i = 0; i < item.quantity; i++) {
      data.push([item.systemSku, item.userSku]);
    }
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
 */
export function exportLabelsToExcel(items: LabelItem[]): void {
  if (items.length === 0) {
    throw new Error('没有选中任何商品');
  }
  
  const blob = generateNiimbotExcel(items);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `niimbot_labels_${timestamp}.xlsx`;
  downloadExcelWeb(blob, filename);
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
