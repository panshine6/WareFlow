/**
 * 图片缓存模块
 * 
 * 将产品图片的 Base64 数据缓存到 IndexedDB，
 * 避免每次查重时都需要重新 fetch 和转换图片
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Platform } from 'react-native';

// 缓存数据结构
interface ImageCacheEntry {
  url: string;           // 图片 URL（作为 key）
  base64: string;        // Base64 数据
  cachedAt: string;      // 缓存时间
  size: number;          // 数据大小（字节）
}

// 数据库 Schema
interface ImageCacheDB extends DBSchema {
  image_cache: {
    key: string;
    value: ImageCacheEntry;
    indexes: {
      'by-cachedAt': string;
    };
  };
}

class ImageCacheStorage {
  private db: IDBPDatabase<ImageCacheDB> | null = null;
  private readonly DB_NAME = 'ImageCacheDB';
  private readonly DB_VERSION = 1;
  private isInitializing = false;
  private memoryCache: Map<string, string> = new Map(); // 内存缓存

  // 初始化数据库
  async init(): Promise<void> {
    if (Platform.OS !== 'web') {
      console.log('[ImageCache] Not on web platform, skipping IndexedDB init');
      return;
    }

    if (this.db) return;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return;
    }

    this.isInitializing = true;
    try {
      this.db = await openDB<ImageCacheDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('image_cache')) {
            const store = db.createObjectStore('image_cache', { keyPath: 'url' });
            store.createIndex('by-cachedAt', 'cachedAt', { unique: false });
          }
        },
      });
      console.log('[ImageCache] IndexedDB initialized');
    } catch (error) {
      console.error('[ImageCache] Failed to init IndexedDB:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  // 确保数据库已初始化
  private async ensureInit(): Promise<boolean> {
    if (Platform.OS !== 'web') return false;
    
    if (!this.db) {
      await this.init();
    }
    return !!this.db;
  }

  /**
   * 获取缓存的 Base64 数据
   */
  async get(url: string): Promise<string | null> {
    // 先检查内存缓存
    if (this.memoryCache.has(url)) {
      return this.memoryCache.get(url)!;
    }

    // 检查 IndexedDB 缓存
    if (!(await this.ensureInit())) return null;

    try {
      const entry = await this.db!.get('image_cache', url);
      if (entry) {
        // 加入内存缓存
        this.memoryCache.set(url, entry.base64);
        return entry.base64;
      }
    } catch (error) {
      console.error('[ImageCache] Failed to get cache:', error);
    }
    return null;
  }

  /**
   * 缓存 Base64 数据
   */
  async set(url: string, base64: string): Promise<void> {
    // 加入内存缓存
    this.memoryCache.set(url, base64);

    // 保存到 IndexedDB
    if (!(await this.ensureInit())) return;

    try {
      const entry: ImageCacheEntry = {
        url,
        base64,
        cachedAt: new Date().toISOString(),
        size: base64.length,
      };
      await this.db!.put('image_cache', entry);
    } catch (error) {
      console.error('[ImageCache] Failed to set cache:', error);
    }
  }

  /**
   * 批量获取缓存
   * 返回 { cached: Map<url, base64>, missing: string[] }
   */
  async getBatch(urls: string[]): Promise<{ cached: Map<string, string>; missing: string[] }> {
    const cached = new Map<string, string>();
    const missing: string[] = [];

    for (const url of urls) {
      const base64 = await this.get(url);
      if (base64) {
        cached.set(url, base64);
      } else {
        missing.push(url);
      }
    }

    return { cached, missing };
  }

  /**
   * 批量缓存
   */
  async setBatch(entries: Array<{ url: string; base64: string }>): Promise<void> {
    for (const { url, base64 } of entries) {
      await this.set(url, base64);
    }
  }

  /**
   * 删除缓存
   */
  async delete(url: string): Promise<void> {
    this.memoryCache.delete(url);

    if (!(await this.ensureInit())) return;

    try {
      await this.db!.delete('image_cache', url);
    } catch (error) {
      console.error('[ImageCache] Failed to delete cache:', error);
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();

    if (!(await this.ensureInit())) return;

    try {
      await this.db!.clear('image_cache');
      console.log('[ImageCache] Cache cleared');
    } catch (error) {
      console.error('[ImageCache] Failed to clear cache:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{ count: number; totalSize: number }> {
    if (!(await this.ensureInit())) {
      return { count: 0, totalSize: 0 };
    }

    try {
      const all = await this.db!.getAll('image_cache');
      const totalSize = all.reduce((sum, entry) => sum + entry.size, 0);
      return { count: all.length, totalSize };
    } catch (error) {
      console.error('[ImageCache] Failed to get stats:', error);
      return { count: 0, totalSize: 0 };
    }
  }

  /**
   * 清理过期缓存（超过指定天数的）
   */
  async cleanOldCache(maxAgeDays: number = 30): Promise<number> {
    if (!(await this.ensureInit())) return 0;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
      const cutoffStr = cutoffDate.toISOString();

      const all = await this.db!.getAll('image_cache');
      let deletedCount = 0;

      for (const entry of all) {
        if (entry.cachedAt < cutoffStr) {
          await this.db!.delete('image_cache', entry.url);
          this.memoryCache.delete(entry.url);
          deletedCount++;
        }
      }

      console.log(`[ImageCache] Cleaned ${deletedCount} old entries`);
      return deletedCount;
    } catch (error) {
      console.error('[ImageCache] Failed to clean old cache:', error);
      return 0;
    }
  }
}

// 导出单例
export const imageCache = new ImageCacheStorage();

/**
 * 获取图片的 Base64 数据（带缓存）
 * 
 * @param imageUrl 图片 URL
 * @returns Base64 数据字符串
 */
export async function getImageBase64WithCache(imageUrl: string): Promise<string> {
  // 尝试从缓存获取
  const cached = await imageCache.get(imageUrl);
  if (cached) {
    console.log(`[ImageCache] Cache hit: ${imageUrl.substring(0, 50)}...`);
    return cached;
  }

  // 缓存未命中，fetch 并转换
  console.log(`[ImageCache] Cache miss, fetching: ${imageUrl.substring(0, 50)}...`);
  
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        // 保存到缓存
        await imageCache.set(imageUrl, base64);
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`[ImageCache] Failed to fetch image: ${imageUrl}`, error);
    throw error;
  }
}

/**
 * 批量获取图片的 Base64 数据（带缓存）
 * 
 * @param imageUrls 图片 URL 数组
 * @param onProgress 进度回调
 * @returns Base64 数据数组
 */
export async function getBatchImageBase64WithCache(
  imageUrls: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  const results: string[] = new Array(imageUrls.length);
  
  // 先检查缓存
  const { cached, missing } = await imageCache.getBatch(imageUrls);
  
  // 填充已缓存的结果
  for (let i = 0; i < imageUrls.length; i++) {
    const cachedBase64 = cached.get(imageUrls[i]);
    if (cachedBase64) {
      results[i] = cachedBase64;
    }
  }

  const cacheHits = cached.size;
  const cacheMisses = missing.length;
  console.log(`[ImageCache] Batch: ${cacheHits} hits, ${cacheMisses} misses`);

  // 并行获取未缓存的图片
  if (missing.length > 0) {
    const BATCH_SIZE = 5; // 并行获取数量
    let completed = cacheHits;

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (url) => {
        try {
          const base64 = await getImageBase64WithCache(url);
          const originalIndex = imageUrls.indexOf(url);
          results[originalIndex] = base64;
          completed++;
          onProgress?.(completed, imageUrls.length);
        } catch (error) {
          console.error(`[ImageCache] Failed to get image: ${url}`, error);
          const originalIndex = imageUrls.indexOf(url);
          results[originalIndex] = ''; // 失败时返回空字符串
        }
      }));
    }
  } else {
    onProgress?.(imageUrls.length, imageUrls.length);
  }

  return results;
}
