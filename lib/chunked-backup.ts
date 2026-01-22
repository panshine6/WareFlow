/**
 * 分片备份工具库
 * 支持将大型备份数据分成多个小文件导出，以及合并多个分片文件导入
 * 专为 iPhone Safari 的内存限制优化
 * 
 * v1.3.11 优化：
 * - 每个分片只包含 1 个产品，避免内存溢出
 * - 使用流式处理，逐个产品导出
 * - 增加暂停时间，让浏览器有机会回收内存
 */

import { Platform } from 'react-native';
import { indexedDBStorage } from './indexeddb-storage';
import { ProductStorageAdapter, SettingsStorageAdapter } from './storage-adapter';
import type { Product } from '@/types/product';

// 分片大小配置（每个分片的产品数量）
// 优化：每个分片只包含 1 个产品，避免内存溢出
const PRODUCTS_PER_CHUNK = 1;

// 分片元数据接口
export interface ChunkMetadata {
  version: number;
  chunkIndex: number;
  totalChunks: number;
  backupId: string;
  exportDate: string;
  productsInChunk: number;
  totalProducts: number;
  hasHistory: boolean;
  hasBoxes: boolean;
  hasSettings: boolean;
}

// 分片数据接口
export interface BackupChunk {
  metadata: ChunkMetadata;
  products: Product[];
  history?: any[];
  boxes?: any[];
  settings?: any;
}

// 导出进度回调
export type ExportProgressCallback = (progress: {
  currentChunk: number;
  totalChunks: number;
  currentProduct: number;
  totalProducts: number;
  status: string;
}) => void;

// 导入进度回调
export type ImportProgressCallback = (progress: {
  currentFile: number;
  totalFiles: number;
  currentProduct: number;
  totalProducts: number;
  status: string;
}) => void;

/**
 * 生成唯一的备份 ID
 */
function generateBackupId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * 计算需要的分片数量
 */
export function calculateChunkCount(totalProducts: number): number {
  return Math.ceil(totalProducts / PRODUCTS_PER_CHUNK);
}

/**
 * 强制垃圾回收（尽可能释放内存）
 */
async function forceGC(): Promise<void> {
  // 给浏览器足够的时间进行垃圾回收
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * 分片导出数据
 * 返回一个生成器，逐个生成分片数据
 * 
 * 优化策略：
 * 1. 每个分片只包含 1 个产品
 * 2. 每次只从数据库读取 1 个产品
 * 3. 生成 JSON 后立即释放产品数据
 * 4. 增加暂停时间让浏览器回收内存
 */
export async function* exportChunks(
  onProgress?: ExportProgressCallback
): AsyncGenerator<{ filename: string; data: string; chunkIndex: number; totalChunks: number }> {
  const backupId = generateBackupId();
  
  // 获取产品总数（轻量级操作）
  let totalProducts = 0;
  try {
    const countResult = await ProductStorageAdapter.getProductCount();
    totalProducts = countResult.total;
  } catch (error) {
    console.error('[ChunkedBackup] Failed to get product count:', error);
    throw new Error('无法获取产品数量，请刷新页面重试');
  }
  
  const totalChunks = calculateChunkCount(totalProducts);
  
  console.log(`[ChunkedBackup] Starting export: ${totalProducts} products, ${totalChunks} chunks`);
  
  // 等待一下，让之前的操作完成
  await forceGC();
  
  // 获取设置（只在第一个分片中包含）- 轻量级数据
  let settings: any = null;
  try {
    settings = await SettingsStorageAdapter.get();
  } catch (error) {
    console.warn('[ChunkedBackup] Failed to get settings:', error);
  }
  
  // 获取 Box 数据（只在第一个分片中包含）- 轻量级数据
  let boxes: any[] = [];
  try {
    const { getAllBoxes } = await import('./box-storage');
    boxes = await getAllBoxes();
  } catch (error) {
    console.warn('[ChunkedBackup] Failed to get boxes:', error);
  }
  
  // 等待一下
  await forceGC();
  
  // 逐个产品导出
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    onProgress?.({
      currentChunk: chunkIndex + 1,
      totalChunks,
      currentProduct: chunkIndex,
      totalProducts,
      status: `正在导出第 ${chunkIndex + 1}/${totalChunks} 个产品...`,
    });
    
    // 获取单个产品
    let products: Product[] = [];
    try {
      products = await ProductStorageAdapter.getProductsBatch(PRODUCTS_PER_CHUNK, chunkIndex);
    } catch (error) {
      console.error(`[ChunkedBackup] Failed to get product ${chunkIndex + 1}:`, error);
      throw new Error(`获取产品 ${chunkIndex + 1} 失败，请刷新页面重试`);
    }
    
    // 构建分片数据
    const chunk: BackupChunk = {
      metadata: {
        version: 3, // 版本 3 表示分片备份
        chunkIndex,
        totalChunks,
        backupId,
        exportDate: new Date().toISOString(),
        productsInChunk: products.length,
        totalProducts,
        hasHistory: false,
        hasBoxes: chunkIndex === 0 && boxes.length > 0,
        hasSettings: chunkIndex === 0,
      },
      products,
    };
    
    // 第一个分片包含额外数据
    if (chunkIndex === 0) {
      chunk.settings = settings;
      if (boxes.length > 0) {
        chunk.boxes = boxes;
      }
    }
    
    // 生成文件名
    const filename = `WareFlow-backup-${backupId}-part${chunkIndex + 1}.json`;
    
    // 序列化数据（不使用缩进，减少内存占用）
    const data = JSON.stringify(chunk);
    
    console.log(`[ChunkedBackup] Generated chunk ${chunkIndex + 1}/${totalChunks}, size: ${(data.length / 1024 / 1024).toFixed(2)}MB`);
    
    yield {
      filename,
      data,
      chunkIndex,
      totalChunks,
    };
    
    // 清理引用，帮助垃圾回收
    products.length = 0;
    
    // 等待较长时间，让浏览器有机会释放内存
    await forceGC();
  }
  
  onProgress?.({
    currentChunk: totalChunks,
    totalChunks,
    currentProduct: totalProducts,
    totalProducts,
    status: '导出完成！',
  });
}

/**
 * 下载单个分片文件（Web 平台）
 */
export function downloadChunk(filename: string, data: string): void {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 立即释放 URL
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * 验证分片文件
 */
export function validateChunk(data: string): { valid: boolean; metadata?: ChunkMetadata; error?: string } {
  try {
    const chunk = JSON.parse(data) as BackupChunk;
    
    // 检查是否是分片格式
    if (!chunk.metadata) {
      // 可能是旧版本的完整备份
      if ((chunk as any).version && (chunk as any).products) {
        return {
          valid: true,
          metadata: {
            version: (chunk as any).version,
            chunkIndex: 0,
            totalChunks: 1,
            backupId: 'legacy',
            exportDate: (chunk as any).exportDate || new Date().toISOString(),
            productsInChunk: (chunk as any).products.length,
            totalProducts: (chunk as any).products.length,
            hasHistory: !!(chunk as any).history,
            hasBoxes: !!(chunk as any).boxes,
            hasSettings: !!(chunk as any).settings,
          } as ChunkMetadata,
        };
      }
      return { valid: false, error: '无效的备份文件格式' };
    }
    
    // 验证分片元数据
    if (typeof chunk.metadata.chunkIndex !== 'number' ||
        typeof chunk.metadata.totalChunks !== 'number' ||
        !chunk.metadata.backupId) {
      return { valid: false, error: '分片元数据不完整' };
    }
    
    // 验证产品数据
    if (!Array.isArray(chunk.products)) {
      return { valid: false, error: '产品数据格式错误' };
    }
    
    return { valid: true, metadata: chunk.metadata };
  } catch (error) {
    return { valid: false, error: '无法解析 JSON 文件' };
  }
}

/**
 * 合并多个分片文件
 */
export async function mergeChunks(
  chunks: { filename: string; data: string }[],
  onProgress?: ImportProgressCallback
): Promise<{ success: boolean; mergedData?: string; error?: string }> {
  try {
    // 解析所有分片
    const parsedChunks: { chunk: BackupChunk; filename: string }[] = [];
    
    for (const { filename, data } of chunks) {
      const validation = validateChunk(data);
      if (!validation.valid) {
        return { success: false, error: `文件 ${filename} 验证失败: ${validation.error}` };
      }
      
      const chunk = JSON.parse(data) as BackupChunk;
      parsedChunks.push({ chunk, filename });
    }
    
    // 检查是否是旧版本的完整备份
    if (parsedChunks.length === 1 && !parsedChunks[0].chunk.metadata) {
      // 直接返回原始数据
      return { success: true, mergedData: chunks[0].data };
    }
    
    // 按 backupId 分组
    const backupGroups = new Map<string, { chunk: BackupChunk; filename: string }[]>();
    for (const item of parsedChunks) {
      const backupId = item.chunk.metadata?.backupId || 'legacy';
      if (!backupGroups.has(backupId)) {
        backupGroups.set(backupId, []);
      }
      backupGroups.get(backupId)!.push(item);
    }
    
    // 如果有多个备份 ID，提示用户
    if (backupGroups.size > 1) {
      return { success: false, error: '检测到来自不同备份的文件，请确保所有分片来自同一次备份' };
    }
    
    // 获取分片列表
    const chunkList = parsedChunks.sort((a, b) => 
      (a.chunk.metadata?.chunkIndex || 0) - (b.chunk.metadata?.chunkIndex || 0)
    );
    
    // 验证分片完整性
    const firstChunk = chunkList[0].chunk;
    const expectedTotalChunks = firstChunk.metadata?.totalChunks || 1;
    
    if (chunkList.length !== expectedTotalChunks) {
      const missingChunks: number[] = [];
      for (let i = 0; i < expectedTotalChunks; i++) {
        if (!chunkList.find(c => c.chunk.metadata?.chunkIndex === i)) {
          missingChunks.push(i + 1);
        }
      }
      return { 
        success: false, 
        error: `缺少分片文件，需要 ${expectedTotalChunks} 个分片，当前只有 ${chunkList.length} 个。缺少: part${missingChunks.join(', part')}` 
      };
    }
    
    // 合并产品数据
    const allProducts: Product[] = [];
    let totalProcessed = 0;
    
    for (let i = 0; i < chunkList.length; i++) {
      const { chunk, filename } = chunkList[i];
      
      onProgress?.({
        currentFile: i + 1,
        totalFiles: chunkList.length,
        currentProduct: totalProcessed,
        totalProducts: firstChunk.metadata?.totalProducts || 0,
        status: `正在合并 ${filename}...`,
      });
      
      allProducts.push(...chunk.products);
      totalProcessed += chunk.products.length;
      
      // 短暂暂停
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // 构建合并后的数据
    const mergedData = {
      version: 2, // 合并后使用标准版本
      exportDate: firstChunk.metadata?.exportDate || new Date().toISOString(),
      productsCount: allProducts.length,
      historyCount: firstChunk.history?.length || 0,
      boxesCount: firstChunk.boxes?.length || 0,
      products: allProducts,
      history: firstChunk.history || [],
      boxes: firstChunk.boxes || [],
      settings: firstChunk.settings,
    };
    
    onProgress?.({
      currentFile: chunkList.length,
      totalFiles: chunkList.length,
      currentProduct: totalProcessed,
      totalProducts: totalProcessed,
      status: '合并完成！',
    });
    
    return { success: true, mergedData: JSON.stringify(mergedData) };
  } catch (error) {
    console.error('[ChunkedBackup] Merge failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '合并失败' };
  }
}

/**
 * 导入合并后的数据
 */
export async function importMergedData(
  jsonString: string,
  onProgress?: ImportProgressCallback
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = JSON.parse(jsonString);
    
    // 验证数据格式
    if (!data.version || !data.products) {
      return { success: false, error: '无效的数据格式' };
    }
    
    onProgress?.({
      currentFile: 1,
      totalFiles: 1,
      currentProduct: 0,
      totalProducts: data.products.length,
      status: '正在导入数据...',
    });
    
    // 使用现有的导入功能
    if (Platform.OS === 'web') {
      await indexedDBStorage.importData(jsonString);
    } else {
      // 原生平台
      await ProductStorageAdapter.replaceAll(data.products);
      
      if (data.settings) {
        await SettingsStorageAdapter.update(data.settings);
      }
      
      if (data.boxes && data.boxes.length > 0) {
        try {
          const { importBoxes } = await import('./box-storage');
          await importBoxes(data.boxes);
        } catch (error) {
          console.warn('[ChunkedBackup] Failed to import boxes:', error);
        }
      }
    }
    
    onProgress?.({
      currentFile: 1,
      totalFiles: 1,
      currentProduct: data.products.length,
      totalProducts: data.products.length,
      status: '导入完成！',
    });
    
    return { success: true };
  } catch (error) {
    console.error('[ChunkedBackup] Import failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '导入失败' };
  }
}

/**
 * 获取导出预估信息
 */
export async function getExportEstimate(): Promise<{
  totalProducts: number;
  estimatedChunks: number;
  estimatedSizePerChunk: string;
}> {
  const { total: totalProducts } = await ProductStorageAdapter.getProductCount();
  const estimatedChunks = calculateChunkCount(totalProducts);
  
  // 估算每个分片大小（每个产品平均 2MB）
  const avgProductSize = 2; // MB
  const estimatedSizePerChunk = `${(PRODUCTS_PER_CHUNK * avgProductSize).toFixed(0)}MB`;
  
  return {
    totalProducts,
    estimatedChunks,
    estimatedSizePerChunk,
  };
}
