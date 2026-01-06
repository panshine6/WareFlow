/**
 * Box 管理器
 * 
 * Box 代码格式: [品牌代码2位]-[大类代码2位]-[流水号4位]
 * 例如: LB-ED-0001
 * 
 * 每个 Box 关联一个货架位置，默认 Shelf-1
 * 一个 Box 可以包含多个产品
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { SkuGenerator, CodeOption } from "./sku-generator";

// 存储键
const BOX_LIST_KEY = "box_list_v1";
const BOX_SEQUENCE_KEY = "box_sequence_v1";

// Box 记录
export interface BoxRecord {
  id: string; // 唯一ID
  code: string; // Box 代码，如 "LB-ED-0001"
  brandCode: string; // 品牌代码
  categoryCode: string; // 大类代码
  serialNumber: number; // 流水号
  shelfLocation: string; // 货架位置
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}

/**
 * Box 管理器服务
 */
export const BoxGenerator = {
  // ==================== Box 列表管理 ====================

  /**
   * 获取所有 Box 列表
   */
  async getAllBoxes(): Promise<BoxRecord[]> {
    try {
      const data = await AsyncStorage.getItem(BOX_LIST_KEY);
      if (data) {
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error("[BoxGenerator] Failed to get boxes:", error);
      return [];
    }
  },

  /**
   * 保存 Box 列表
   */
  async saveBoxes(boxes: BoxRecord[]): Promise<void> {
    try {
      await AsyncStorage.setItem(BOX_LIST_KEY, JSON.stringify(boxes));
    } catch (error) {
      console.error("[BoxGenerator] Failed to save boxes:", error);
    }
  },

  /**
   * 根据 Box 代码查找 Box
   */
  async getBoxByCode(code: string): Promise<BoxRecord | null> {
    const boxes = await this.getAllBoxes();
    return boxes.find(b => b.code === code) || null;
  },

  // ==================== 流水号管理 ====================

  /**
   * 获取当前全局流水号
   */
  async getCurrentSequence(): Promise<number> {
    try {
      const data = await AsyncStorage.getItem(BOX_SEQUENCE_KEY);
      if (data) {
        return parseInt(data, 10);
      }
      return 0;
    } catch (error) {
      console.error("[BoxGenerator] Failed to get sequence:", error);
      return 0;
    }
  },

  /**
   * 保存全局流水号
   */
  async saveSequence(sequence: number): Promise<void> {
    try {
      await AsyncStorage.setItem(BOX_SEQUENCE_KEY, sequence.toString());
    } catch (error) {
      console.error("[BoxGenerator] Failed to save sequence:", error);
    }
  },

  /**
   * 重置全局流水号为0
   */
  async resetSequence(): Promise<void> {
    try {
      await AsyncStorage.setItem(BOX_SEQUENCE_KEY, "0");
      console.log("[BoxGenerator] Sequence reset to 0");
    } catch (error) {
      console.error("[BoxGenerator] Failed to reset sequence:", error);
    }
  },

  /**
   * 获取下一个流水号
   */
  async getNextSequence(): Promise<number> {
    const current = await this.getCurrentSequence();
    return current + 1;
  },

  // ==================== Box 生成 ====================

  /**
   * 预览 Box 代码（不保存）
   */
  async previewBoxCode(brandCode: string, categoryCode: string): Promise<string> {
    const nextSeq = await this.getNextSequence();
    const paddedSeq = nextSeq.toString().padStart(4, "0");
    return `${brandCode}-${categoryCode}-Box-${paddedSeq}`;
  },

  /**
   * 创建新 Box
   */
  async createBox(
    brandCode: string,
    categoryCode: string,
    shelfLocation: string = "Shelf-1"
  ): Promise<BoxRecord> {
    const nextSeq = await this.getNextSequence();
    const paddedSeq = nextSeq.toString().padStart(4, "0");
    const code = `${brandCode}-${categoryCode}-Box-${paddedSeq}`;

    const newBox: BoxRecord = {
      id: `box_${Date.now()}`,
      code,
      brandCode,
      categoryCode,
      serialNumber: nextSeq,
      shelfLocation,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 保存 Box
    const boxes = await this.getAllBoxes();
    boxes.push(newBox);
    await this.saveBoxes(boxes);

    // 更新流水号
    await this.saveSequence(nextSeq);

    return newBox;
  },

  /**
   * 更新 Box 信息
   */
  async updateBox(boxId: string, updates: Partial<Pick<BoxRecord, "shelfLocation">>): Promise<BoxRecord | null> {
    const boxes = await this.getAllBoxes();
    const index = boxes.findIndex(b => b.id === boxId);
    
    if (index === -1) {
      return null;
    }

    boxes[index] = {
      ...boxes[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.saveBoxes(boxes);
    return boxes[index];
  },

  /**
   * 删除 Box
   */
  async deleteBox(boxId: string): Promise<boolean> {
    const boxes = await this.getAllBoxes();
    const filtered = boxes.filter(b => b.id !== boxId);
    
    if (filtered.length === boxes.length) {
      return false; // 没有找到要删除的 Box
    }

    await this.saveBoxes(filtered);
    return true;
  },

  // ==================== 品牌和大类选项 ====================

  /**
   * 获取品牌代码选项（复用 SKU 生成器）
   */
  async getBrandOptions(): Promise<CodeOption[]> {
    const segments = await SkuGenerator.getSegments();
    const brandSegment = segments.find(s => s.id === "brand");
    if (brandSegment) {
      // 过滤掉空值选项
      return brandSegment.options.filter(o => o.code !== "");
    }
    return [{ code: "LB", nameEn: "Ladybuty", nameCn: "Ladybuty" }];
  },

  /**
   * 获取大类代码选项（复用 SKU 生成器）
   */
  async getCategoryOptions(): Promise<CodeOption[]> {
    const segments = await SkuGenerator.getSegments();
    const categorySegment = segments.find(s => s.id === "category");
    if (categorySegment) {
      // 过滤掉空值选项
      return categorySegment.options.filter(o => o.code !== "");
    }
    return [
      { code: "ED", nameEn: "Earring Drop", nameCn: "耳坠" },
      { code: "ES", nameEn: "Earring Stud", nameCn: "耳钉" },
      { code: "NE", nameEn: "Necklace", nameCn: "项链" },
    ];
  },

  // ==================== 产品关联统计 ====================

  /**
   * 获取 Box 中的产品数量
   * 注意：这个函数需要访问产品数据，由调用方提供产品列表
   */
  getProductCountInBox(boxCode: string, products: Array<{ boxName?: string; boxCode?: string }>): number {
    return products.filter(p => p.boxName === boxCode || p.boxCode === boxCode).length;
  },

  /**
   * 检查 Box 是否可以删除（没有关联产品）
   */
  canDeleteBox(boxCode: string, products: Array<{ boxName?: string; boxCode?: string }>): boolean {
    return this.getProductCountInBox(boxCode, products) === 0;
  },
};
