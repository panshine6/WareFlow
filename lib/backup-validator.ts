/**
 * 备份文件验证工具
 * 用于验证备份文件的完整性和质量
 */

import type { Product } from '@/types/product';

// 验证结果接口
export interface BackupValidationResult {
  isValid: boolean;
  fileType: 'json' | 'zip' | 'unknown';
  fileSize: number;
  fileSizeFormatted: string;
  
  // 产品统计
  totalProducts: number;
  activeProducts: number;
  deletedProducts: number;
  
  // 图片统计
  productsWithDetailImage: number;
  productsWithOverviewImage: number;
  productsWithoutImage: number;
  
  // 其他数据
  hasHistory: boolean;
  historyCount: number;
  hasBoxes: boolean;
  boxCount: number;
  hasSettings: boolean;
  
  // 分片信息（如果是分片备份）
  isChunked: boolean;
  chunkCount: number;
  backupId?: string;
  exportDate?: string;
  
  // 错误信息
  errors: string[];
  warnings: string[];
}

// 备份数据接口（兼容多种格式）
interface BackupData {
  version?: number;
  exportDate?: string;
  products?: Product[];
  history?: any[];
  boxes?: any[];
  settings?: any;
  metadata?: {
    version: number;
    chunkIndex: number;
    totalChunks: number;
    backupId: string;
    exportDate: string;
    productsInChunk: number;
    totalProducts: number;
  };
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * 解析 ZIP 文件
 */
async function parseZipFile(data: Uint8Array): Promise<{ filename: string; content: string }[]> {
  const decoder = new TextDecoder();
  const files: { filename: string; content: string }[] = [];
  let offset = 0;
  
  while (offset < data.length - 4) {
    const view = new DataView(data.buffer, data.byteOffset + offset);
    const signature = view.getUint32(0, true);
    
    if (signature === 0x04034b50) { // Local file header
      const filenameLength = view.getUint16(26, true);
      const extraLength = view.getUint16(28, true);
      const compressedSize = view.getUint32(18, true);
      
      const filenameStart = offset + 30;
      const filename = decoder.decode(data.slice(filenameStart, filenameStart + filenameLength));
      
      const dataStart = filenameStart + filenameLength + extraLength;
      const fileContent = decoder.decode(data.slice(dataStart, dataStart + compressedSize));
      
      files.push({ filename, content: fileContent });
      
      offset = dataStart + compressedSize;
    } else if (signature === 0x02014b50) { // Central directory header
      break;
    } else {
      offset++;
    }
  }
  
  return files;
}

/**
 * 验证单个 JSON 备份数据
 */
function validateJsonData(data: BackupData, result: BackupValidationResult): void {
  // 检查是否是分片格式
  if (data.metadata) {
    result.isChunked = true;
    result.backupId = data.metadata.backupId;
    result.exportDate = data.metadata.exportDate;
  } else if (data.exportDate) {
    result.exportDate = data.exportDate;
  }
  
  // 统计产品
  const products = data.products || [];
  result.totalProducts += products.length;
  
  for (const product of products) {
    // 统计删除状态
    if (product.isDeleted) {
      result.deletedProducts++;
    } else {
      result.activeProducts++;
    }
    
    // 统计图片
    const hasDetailImage = !!(product.detailImageUri && product.detailImageUri.length > 100);
    const hasOverviewImage = !!(product.overviewImageUri && product.overviewImageUri.length > 100);
    
    if (hasDetailImage) {
      result.productsWithDetailImage++;
    }
    if (hasOverviewImage) {
      result.productsWithOverviewImage++;
    }
    if (!hasDetailImage && !hasOverviewImage) {
      result.productsWithoutImage++;
    }
  }
  
  // 统计历史记录
  if (data.history && Array.isArray(data.history)) {
    result.hasHistory = true;
    result.historyCount += data.history.length;
  }
  
  // 统计盒子
  if (data.boxes && Array.isArray(data.boxes)) {
    result.hasBoxes = true;
    result.boxCount += data.boxes.length;
  }
  
  // 统计设置
  if (data.settings) {
    result.hasSettings = true;
  }
}

/**
 * 验证备份文件
 * @param file 文件对象
 * @returns 验证结果
 */
export async function validateBackupFile(file: File): Promise<BackupValidationResult> {
  const result: BackupValidationResult = {
    isValid: false,
    fileType: 'unknown',
    fileSize: file.size,
    fileSizeFormatted: formatFileSize(file.size),
    totalProducts: 0,
    activeProducts: 0,
    deletedProducts: 0,
    productsWithDetailImage: 0,
    productsWithOverviewImage: 0,
    productsWithoutImage: 0,
    hasHistory: false,
    historyCount: 0,
    hasBoxes: false,
    boxCount: 0,
    hasSettings: false,
    isChunked: false,
    chunkCount: 0,
    errors: [],
    warnings: [],
  };
  
  try {
    // 检测文件类型
    const fileName = file.name.toLowerCase();
    const isZip = fileName.endsWith('.zip') || file.type === 'application/zip';
    const isJson = fileName.endsWith('.json') || file.type === 'application/json';
    
    if (isZip) {
      result.fileType = 'zip';
      
      // 读取 ZIP 文件
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // 解析 ZIP
      const files = await parseZipFile(uint8Array);
      
      if (files.length === 0) {
        result.errors.push('ZIP 文件为空或无法解析');
        return result;
      }
      
      result.chunkCount = files.length;
      result.isChunked = files.length > 1;
      
      // 验证每个分片
      for (const { filename, content } of files) {
        try {
          const data = JSON.parse(content) as BackupData;
          validateJsonData(data, result);
        } catch (e) {
          result.errors.push(`分片 ${filename} JSON 解析失败`);
        }
      }
      
    } else if (isJson) {
      result.fileType = 'json';
      
      // 读取 JSON 文件
      const text = await file.text();
      
      try {
        const data = JSON.parse(text) as BackupData;
        result.chunkCount = 1;
        validateJsonData(data, result);
      } catch (e) {
        result.errors.push('JSON 文件解析失败，文件可能已损坏');
        return result;
      }
      
    } else {
      result.errors.push('不支持的文件类型，请选择 .json 或 .zip 文件');
      return result;
    }
    
    // 生成警告
    if (result.totalProducts === 0) {
      result.warnings.push('备份文件中没有产品数据');
    }
    
    if (result.productsWithoutImage > 0) {
      result.warnings.push(`${result.productsWithoutImage} 个产品没有图片`);
    }
    
    if (result.deletedProducts > result.activeProducts) {
      result.warnings.push('已删除的产品数量超过有效产品数量');
    }
    
    // 检查图片质量（云端压缩版本通常小于 200KB）
    const avgSizePerProduct = result.fileSize / Math.max(result.totalProducts, 1);
    if (avgSizePerProduct < 50 * 1024 && result.productsWithDetailImage > 0) {
      result.warnings.push('图片可能是压缩版本（云端备份），不是原始高清图片');
    }
    
    // 设置验证结果
    result.isValid = result.errors.length === 0 && result.totalProducts > 0;
    
  } catch (error: any) {
    result.errors.push(`验证失败: ${error.message || '未知错误'}`);
  }
  
  return result;
}

/**
 * 生成验证报告文本
 */
export function generateValidationReport(result: BackupValidationResult): string {
  const lines: string[] = [];
  
  lines.push('═══════════════════════════════════════');
  lines.push('       备份文件验证报告');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  
  // 基本信息
  lines.push('【基本信息】');
  lines.push(`文件类型: ${result.fileType.toUpperCase()}`);
  lines.push(`文件大小: ${result.fileSizeFormatted}`);
  if (result.exportDate) {
    lines.push(`导出时间: ${new Date(result.exportDate).toLocaleString('zh-CN')}`);
  }
  if (result.isChunked) {
    lines.push(`分片数量: ${result.chunkCount} 个`);
  }
  lines.push('');
  
  // 产品统计
  lines.push('【产品统计】');
  lines.push(`总产品数: ${result.totalProducts}`);
  lines.push(`有效产品: ${result.activeProducts}`);
  lines.push(`已删除: ${result.deletedProducts}`);
  lines.push('');
  
  // 图片统计
  lines.push('【图片统计】');
  lines.push(`有细节图: ${result.productsWithDetailImage}`);
  lines.push(`有全景图: ${result.productsWithOverviewImage}`);
  lines.push(`无图片: ${result.productsWithoutImage}`);
  lines.push('');
  
  // 其他数据
  lines.push('【其他数据】');
  lines.push(`历史记录: ${result.hasHistory ? `有 (${result.historyCount} 条)` : '无'}`);
  lines.push(`盒子数据: ${result.hasBoxes ? `有 (${result.boxCount} 个)` : '无'}`);
  lines.push(`设置数据: ${result.hasSettings ? '有' : '无'}`);
  lines.push('');
  
  // 验证结果
  lines.push('═══════════════════════════════════════');
  if (result.isValid) {
    lines.push('✅ 验证通过 - 备份文件完整');
  } else {
    lines.push('❌ 验证失败');
  }
  lines.push('═══════════════════════════════════════');
  
  // 错误信息
  if (result.errors.length > 0) {
    lines.push('');
    lines.push('【错误】');
    for (const error of result.errors) {
      lines.push(`❌ ${error}`);
    }
  }
  
  // 警告信息
  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('【警告】');
    for (const warning of result.warnings) {
      lines.push(`⚠️ ${warning}`);
    }
  }
  
  return lines.join('\n');
}
