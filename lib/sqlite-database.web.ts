/**
 * Web 版本的 SQLite Database - 空实现
 * Web 平台使用 AsyncStorage，不需要 SQLite
 */
export class SQLiteDatabase {
  async initialize(): Promise<void> {
    console.warn('[SQLiteDatabase.Web] Not implemented - use AsyncStorage instead');
  }
}

export const db = new SQLiteDatabase();
