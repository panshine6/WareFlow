/**
 * Web 版本的 ProductRepository - 空实现
 * Web 平台使用 AsyncStorage，不需要 SQLite
 */
export class ProductRepository {
  async getForSync(): Promise<any[]> {
    console.warn('[ProductRepository.Web] Not implemented - use ProductStorage instead');
    return [];
  }

  async batchUpsert(products: any[]): Promise<void> {
    console.warn('[ProductRepository.Web] Not implemented - use ProductStorage instead');
  }
}
