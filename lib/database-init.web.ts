/**
 * Web 平台数据库初始化
 * 使用 IndexedDB
 */
import { indexedDBStorage } from './indexeddb-storage';

export async function initDatabase(): Promise<void> {
  try {
    await indexedDBStorage.init();
    console.log('[DatabaseInit] IndexedDB initialized');
  } catch (error) {
    console.error('[DatabaseInit] Failed to initialize IndexedDB:', error);
  }
}
