/**
 * Web 版本的 HistoryRepository - 空实现
 * Web 平台使用 AsyncStorage，不需要 SQLite
 */
export class HistoryRepository {
  async add(record: any): Promise<void> {
    console.warn('[HistoryRepository.Web] Not implemented - use ProductStorage instead');
  }

  async getByProductId(productId: string): Promise<any[]> {
    console.warn('[HistoryRepository.Web] Not implemented - use ProductStorage instead');
    return [];
  }
}
