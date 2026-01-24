/**
 * 分片备份工具库
 * 支持将大型备份数据导出为单个 ZIP 文件，以及从 ZIP 文件导入
 * 专为 iPhone Safari 的内存限制优化
 * 
 * v1.3.13 优化：
 * - 导出为单个 ZIP 文件，内部包含多个分片 JSON
 * - 每个分片包含 20 个产品
 * - 用户只需下载一个文件
 */

import { Platform } from 'react-native';
import { indexedDBStorage } from './indexeddb-storage';
import { ProductStorageAdapter, SettingsStorageAdapter } from './storage-adapter';
import type { Product } from '@/types/product';

// 分片大小配置（每个分片的产品数量）
// 20 个产品约 40MB，在内存限制内
const PRODUCTS_PER_CHUNK = 20;

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
  await new Promise(resolve => setTimeout(resolve, 300));
}

/**
 * 导出为单个 ZIP 文件
 * 内部包含多个分片 JSON 文件
 */
export async function exportToZip(
  onProgress?: ExportProgressCallback
): Promise<{ success: boolean; filename?: string; blob?: Blob; error?: string }> {
  const backupId = generateBackupId();
  
  try {
    // 获取产品总数
    let totalProducts = 0;
    try {
      const countResult = await ProductStorageAdapter.getProductCount();
      totalProducts = countResult.total;
    } catch (error) {
      console.error('[ChunkedBackup] Failed to get product count:', error);
      return { success: false, error: '无法获取产品数量，请刷新页面重试' };
    }
    
    const totalChunks = calculateChunkCount(totalProducts);
    
    console.log(`[ChunkedBackup] Starting ZIP export: ${totalProducts} products, ${totalChunks} chunks`);
    
    onProgress?.({
      currentChunk: 0,
      totalChunks,
      currentProduct: 0,
      totalProducts,
      status: '正在准备导出...',
    });
    
    // 等待一下，让之前的操作完成
    await forceGC();
    
    // 获取设置（只在第一个分片中包含）
    let settings: any = null;
    try {
      settings = await SettingsStorageAdapter.get();
    } catch (error) {
      console.warn('[ChunkedBackup] Failed to get settings:', error);
    }
    
    // 获取 Box 数据（只在第一个分片中包含）
    let boxes: any[] = [];
    try {
      const { getAllBoxes } = await import('./box-storage');
      boxes = await getAllBoxes();
    } catch (error) {
      console.warn('[ChunkedBackup] Failed to get boxes:', error);
    }
    
    await forceGC();
    
    // 收集所有分片数据
    const chunkDataList: { filename: string; data: string }[] = [];
    
    // 逐个分片导出
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const startProduct = chunkIndex * PRODUCTS_PER_CHUNK;
      
      onProgress?.({
        currentChunk: chunkIndex + 1,
        totalChunks,
        currentProduct: startProduct,
        totalProducts,
        status: `正在处理第 ${chunkIndex + 1}/${totalChunks} 个分片...`,
      });
      
      // 获取当前分片的产品
      let products: Product[] = [];
      try {
        products = await ProductStorageAdapter.getProductsBatch(PRODUCTS_PER_CHUNK, chunkIndex);
      } catch (error) {
        console.error(`[ChunkedBackup] Failed to get products for chunk ${chunkIndex + 1}:`, error);
        return { success: false, error: `获取产品数据失败，请刷新页面重试` };
      }
      
      // 构建分片数据
      const chunk: BackupChunk = {
        metadata: {
          version: 3,
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
      const filename = `part${String(chunkIndex + 1).padStart(3, '0')}.json`;
      
      // 序列化数据
      const data = JSON.stringify(chunk);
      
      console.log(`[ChunkedBackup] Generated chunk ${chunkIndex + 1}/${totalChunks}, size: ${(data.length / 1024 / 1024).toFixed(2)}MB`);
      
      chunkDataList.push({ filename, data });
      
      // 清理引用
      products.length = 0;
      
      // 等待垃圾回收
      await forceGC();
    }
    
    onProgress?.({
      currentChunk: totalChunks,
      totalChunks,
      currentProduct: totalProducts,
      totalProducts,
      status: '正在打包 ZIP 文件...',
    });
    
    // 创建 ZIP 文件（使用简单的 ZIP 格式）
    const zipBlob = await createZipBlob(chunkDataList, backupId);
    
    const zipFilename = `WareFlow-backup-${backupId}.zip`;
    
    onProgress?.({
      currentChunk: totalChunks,
      totalChunks,
      currentProduct: totalProducts,
      totalProducts,
      status: '导出完成！',
    });
    
    return { success: true, filename: zipFilename, blob: zipBlob };
  } catch (error) {
    console.error('[ChunkedBackup] Export failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '导出失败' };
  }
}

/**
 * 创建 ZIP Blob（简单实现，不依赖外部库）
 * 使用 STORE 方法（无压缩），避免内存问题
 */
async function createZipBlob(
  files: { filename: string; data: string }[],
  backupId: string
): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;
  
  // 添加 manifest 文件
  const manifest = {
    version: 3,
    backupId,
    exportDate: new Date().toISOString(),
    totalChunks: files.length,
    files: files.map(f => f.filename),
  };
  const manifestData = JSON.stringify(manifest, null, 2);
  files.unshift({ filename: 'manifest.json', data: manifestData });
  
  for (const file of files) {
    const fileData = encoder.encode(file.data);
    const filenameBytes = encoder.encode(file.filename);
    
    // Local file header
    const localHeader = new Uint8Array(30 + filenameBytes.length);
    const view = new DataView(localHeader.buffer);
    
    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed to extract
    view.setUint16(6, 0, true); // General purpose bit flag
    view.setUint16(8, 0, true); // Compression method (STORE)
    view.setUint16(10, 0, true); // File last modification time
    view.setUint16(12, 0, true); // File last modification date
    view.setUint32(14, crc32(fileData), true); // CRC-32
    view.setUint32(18, fileData.length, true); // Compressed size
    view.setUint32(22, fileData.length, true); // Uncompressed size
    view.setUint16(26, filenameBytes.length, true); // File name length
    view.setUint16(28, 0, true); // Extra field length
    localHeader.set(filenameBytes, 30);
    
    // Central directory header
    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    
    centralView.setUint32(0, 0x02014b50, true); // Central directory signature
    centralView.setUint16(4, 20, true); // Version made by
    centralView.setUint16(6, 20, true); // Version needed to extract
    centralView.setUint16(8, 0, true); // General purpose bit flag
    centralView.setUint16(10, 0, true); // Compression method
    centralView.setUint16(12, 0, true); // File last modification time
    centralView.setUint16(14, 0, true); // File last modification date
    centralView.setUint32(16, crc32(fileData), true); // CRC-32
    centralView.setUint32(20, fileData.length, true); // Compressed size
    centralView.setUint32(24, fileData.length, true); // Uncompressed size
    centralView.setUint16(28, filenameBytes.length, true); // File name length
    centralView.setUint16(30, 0, true); // Extra field length
    centralView.setUint16(32, 0, true); // File comment length
    centralView.setUint16(34, 0, true); // Disk number start
    centralView.setUint16(36, 0, true); // Internal file attributes
    centralView.setUint32(38, 0, true); // External file attributes
    centralView.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(filenameBytes, 46);
    
    parts.push(localHeader);
    parts.push(fileData);
    centralDirectory.push(centralHeader);
    
    offset += localHeader.length + fileData.length;
  }
  
  // End of central directory
  const centralDirSize = centralDirectory.reduce((sum, arr) => sum + arr.length, 0);
  const endOfCentralDir = new Uint8Array(22);
  const endView = new DataView(endOfCentralDir.buffer);
  
  endView.setUint32(0, 0x06054b50, true); // End of central directory signature
  endView.setUint16(4, 0, true); // Number of this disk
  endView.setUint16(6, 0, true); // Disk where central directory starts
  endView.setUint16(8, files.length, true); // Number of central directory records on this disk
  endView.setUint16(10, files.length, true); // Total number of central directory records
  endView.setUint32(12, centralDirSize, true); // Size of central directory
  endView.setUint32(16, offset, true); // Offset of start of central directory
  endView.setUint16(20, 0, true); // Comment length
  
  return new Blob([...parts, ...centralDirectory, endOfCentralDir], { type: 'application/zip' });
}

/**
 * CRC32 计算
 */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  const table = getCrc32Table();
  
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let crc32Table: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
  if (crc32Table) return crc32Table;
  
  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }
  return crc32Table;
}

/**
 * 下载 ZIP 文件
 */
export function downloadZip(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 延迟释放 URL
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * 从 ZIP 文件导入数据
 */
export async function importFromZip(
  zipFile: File,
  onProgress?: ImportProgressCallback
): Promise<{ success: boolean; error?: string }> {
  try {
    onProgress?.({
      currentFile: 0,
      totalFiles: 1,
      currentProduct: 0,
      totalProducts: 0,
      status: '正在读取 ZIP 文件...',
    });
    
    // 读取 ZIP 文件
    const arrayBuffer = await zipFile.arrayBuffer();
    const files = await parseZip(new Uint8Array(arrayBuffer));
    
    // 查找 manifest
    const manifestFile = files.find(f => f.filename === 'manifest.json');
    if (!manifestFile) {
      return { success: false, error: 'ZIP 文件中缺少 manifest.json' };
    }
    
    const manifest = JSON.parse(manifestFile.data);
    const totalChunks = manifest.totalChunks || files.length - 1;
    
    onProgress?.({
      currentFile: 0,
      totalFiles: totalChunks,
      currentProduct: 0,
      totalProducts: 0,
      status: '正在解析备份数据...',
    });
    
    // 收集所有分片
    const chunks: { filename: string; data: string }[] = [];
    for (const file of files) {
      if (file.filename.startsWith('part') && file.filename.endsWith('.json')) {
        chunks.push(file);
      }
    }
    
    // 按文件名排序
    chunks.sort((a, b) => a.filename.localeCompare(b.filename));
    
    // 合并并导入
    const mergeResult = await mergeChunks(chunks, onProgress);
    if (!mergeResult.success) {
      return { success: false, error: mergeResult.error };
    }
    
    // 导入数据
    const importResult = await importMergedData(mergeResult.mergedData!, onProgress);
    return importResult;
  } catch (error) {
    console.error('[ChunkedBackup] Import from ZIP failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '导入失败' };
  }
}

/**
 * 解析 ZIP 文件（简单实现）
 */
async function parseZip(data: Uint8Array): Promise<{ filename: string; data: string }[]> {
  const decoder = new TextDecoder();
  const files: { filename: string; data: string }[] = [];
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
      const fileData = decoder.decode(data.slice(dataStart, dataStart + compressedSize));
      
      files.push({ filename, data: fileData });
      
      offset = dataStart + compressedSize;
    } else if (signature === 0x02014b50) { // Central directory header
      break; // 到达中央目录，停止解析
    } else {
      offset++;
    }
  }
  
  return files;
}

// ==================== 保留旧的分片导出接口（用于兼容） ====================

/**
 * 分片导出数据（生成器版本，保留用于兼容）
 */
export async function* exportChunks(
  onProgress?: ExportProgressCallback
): AsyncGenerator<{ filename: string; data: string; chunkIndex: number; totalChunks: number }> {
  // 使用新的 ZIP 导出，但保持接口兼容
  const result = await exportToZip(onProgress);
  if (result.success && result.blob) {
    // 将 ZIP 转换为单个"分片"
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(result.blob!);
    });
    
    yield {
      filename: result.filename!,
      data: base64,
      chunkIndex: 0,
      totalChunks: 1,
    };
  }
}

/**
 * 下载单个分片文件（Web 平台）- 保留用于兼容
 */
export function downloadChunk(filename: string, data: string): void {
  // 检查是否是 base64 数据（ZIP 文件）
  if (data.startsWith('data:application/zip')) {
    const link = document.createElement('a');
    link.href = data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    // 普通 JSON 数据
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }
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
      version: 2,
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
  
  // 估算每个分片大小
  const avgProductSize = 2; // MB
  const estimatedSizePerChunk = `${(PRODUCTS_PER_CHUNK * avgProductSize).toFixed(0)}MB`;
  
  return {
    totalProducts,
    estimatedChunks,
    estimatedSizePerChunk,
  };
}
