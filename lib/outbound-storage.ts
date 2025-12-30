/**
 * 出库记录存储模块
 * 使用 IndexedDB 存储出库记录
 */

import { Platform } from "react-native";
import type { OutboundRecord } from "@/types/product";

const STORAGE_KEY = "outbound_records";

/**
 * 获取 IndexedDB 数据库
 */
async function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("OutboundDB", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("outbound")) {
        const store = db.createObjectStore("outbound", { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

/**
 * 出库记录存储类
 */
export const OutboundStorage = {
  /**
   * 获取所有出库记录
   */
  async getAll(): Promise<OutboundRecord[]> {
    if (Platform.OS !== "web") {
      // 原生平台暂不支持
      return [];
    }

    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(["outbound"], "readonly");
        const store = transaction.objectStore("outbound");
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch (error) {
      console.error("[OutboundStorage] Failed to get all records:", error);
      return [];
    }
  },

  /**
   * 添加出库记录
   */
  async add(record: OutboundRecord): Promise<void> {
    if (Platform.OS !== "web") {
      return;
    }

    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(["outbound"], "readwrite");
        const store = transaction.objectStore("outbound");
        const request = store.add(record);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error("[OutboundStorage] Failed to add record:", error);
      throw error;
    }
  },

  /**
   * 根据 ID 获取出库记录
   */
  async getById(id: string): Promise<OutboundRecord | null> {
    if (Platform.OS !== "web") {
      return null;
    }

    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(["outbound"], "readonly");
        const store = transaction.objectStore("outbound");
        const request = store.get(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    } catch (error) {
      console.error("[OutboundStorage] Failed to get record by ID:", error);
      return null;
    }
  },

  /**
   * 删除出库记录
   */
  async delete(id: string): Promise<void> {
    if (Platform.OS !== "web") {
      return;
    }

    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(["outbound"], "readwrite");
        const store = transaction.objectStore("outbound");
        const request = store.delete(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error("[OutboundStorage] Failed to delete record:", error);
      throw error;
    }
  },

  /**
   * 按时间范围查询出库记录
   */
  async getByTimeRange(startTime: string, endTime: string): Promise<OutboundRecord[]> {
    if (Platform.OS !== "web") {
      return [];
    }

    try {
      const allRecords = await this.getAll();
      return allRecords.filter((record) => {
        const timestamp = new Date(record.timestamp).getTime();
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        return timestamp >= start && timestamp <= end;
      });
    } catch (error) {
      console.error("[OutboundStorage] Failed to get records by time range:", error);
      return [];
    }
  },

  /**
   * 按产品 SKU 查询出库记录
   */
  async getBySku(sku: string): Promise<OutboundRecord[]> {
    if (Platform.OS !== "web") {
      return [];
    }

    try {
      const allRecords = await this.getAll();
      return allRecords.filter((record) =>
        record.items.some((item) => item.sku.toLowerCase().includes(sku.toLowerCase()))
      );
    } catch (error) {
      console.error("[OutboundStorage] Failed to get records by SKU:", error);
      return [];
    }
  },

  /**
   * 按存储位置（Box）查询出库记录
   */
  async getByLocation(location: string): Promise<OutboundRecord[]> {
    if (Platform.OS !== "web") {
      return [];
    }

    try {
      const allRecords = await this.getAll();
      return allRecords.filter((record) =>
        record.items.some((item) =>
          item.storageLocation.toLowerCase().includes(location.toLowerCase())
        )
      );
    } catch (error) {
      console.error("[OutboundStorage] Failed to get records by location:", error);
      return [];
    }
  },

  /**
   * 清空所有出库记录
   */
  async clear(): Promise<void> {
    if (Platform.OS !== "web") {
      return;
    }

    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(["outbound"], "readwrite");
        const store = transaction.objectStore("outbound");
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error("[OutboundStorage] Failed to clear records:", error);
      throw error;
    }
  },
};
