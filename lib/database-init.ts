/**
 * 原生平台数据库初始化
 * 使用 SQLite
 */
import { SQLiteDatabase } from './sqlite-database';

export async function initDatabase(): Promise<void> {
  try {
    await SQLiteDatabase.getInstance().initialize();
    console.log('[DatabaseInit] SQLite database initialized');
  } catch (error) {
    console.error('[DatabaseInit] Failed to initialize SQLite:', error);
  }
}
