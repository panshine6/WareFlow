/**
 * SKU 生成助手 v2
 * 
 * 支持动态段数和自定义字段
 * 默认格式: [品牌代码]-[大类代码]-[材料代码]-[颜色代码]-[流水号(4位)]
 * 可扩展为: [品牌]-[大类]-[材料]-[颜色]-[设计系列]-[流水号] 等
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// 存储键
const SKU_SEQUENCE_KEY = "sku_sequences_v2";
const SKU_SEGMENTS_KEY = "sku_segments_v2";
const SKU_HISTORY_KEY = "sku_history_v2";
const SKU_LAST_SELECTION_KEY = "sku_last_selection";

// 代码选项接口
export interface CodeOption {
  code: string;
  nameEn: string;
  nameCn: string;
  isCustom?: boolean; // 是否为用户自定义
  colorHex?: string; // 颜色代码对应的十六进制颜色值（仅用于颜色段）
}

// 默认颜色映射表
export const DEFAULT_COLOR_MAP: Record<string, string> = {
  "RE": "#FF0000", // 红色
  "BL": "#0000FF", // 蓝色
  "GR": "#00FF00", // 绿色
  "YE": "#FFFF00", // 黄色
  "BK": "#000000", // 黑色
  "WH": "#FFFFFF", // 白色
  "PK": "#FFC0CB", // 粉色
  "OR": "#FFA500", // 橙色
  "PU": "#800080", // 紫色
  "SV": "#C0C0C0", // 银色
  "GD": "#FFD700", // 金色
  "BR": "#8B4513", // 棕色
  "MC": "linear-gradient(45deg, #FF0000, #00FF00, #0000FF)", // 多色（渐变）
  "NT": "#DEB887", // 原色/自然色
  "GE": "#808080", // 灰色
  "DR": "#006400", // 墨绿
};

// SKU 段定义
export interface SkuSegment {
  id: string;
  name: string; // 段名称，如"品牌代码"
  codeLength: number; // 代码长度，如 2
  options: CodeOption[]; // 可选项
  isRequired: boolean; // 是否必填
  order: number; // 排序
  isSerialNumber?: boolean; // 是否是流水号段（特殊段）
}

// SKU 序列记录
export interface SkuSequence {
  prefix: string; // 前缀，如 "LB-ES-CR-RE"
  lastNumber: number; // 最后使用的流水号
  updatedAt: string; // 最后更新时间
}

// SKU 使用记录
export interface SkuHistoryRecord {
  sku: string; // 完整 SKU
  prefix: string; // 前缀
  number: number; // 流水号
  createdAt: string; // 创建时间
  segments: Record<string, string>; // 各段的值
}

// 预设段定义
export const DEFAULT_SEGMENTS: SkuSegment[] = [
  {
    id: "brand",
    name: "品牌代码",
    codeLength: 2,
    isRequired: false, // 改为非必填，支持空值
    order: 1,
    options: [
      { code: "", nameEn: "None", nameCn: "不选择" }, // 空值选项
      { code: "LB", nameEn: "Ladybuty", nameCn: "Ladybuty" },
    ],
  },
  {
    id: "category",
    name: "大类代码",
    codeLength: 2,
    isRequired: false,
    order: 2,
    options: [
      { code: "", nameEn: "None", nameCn: "不选择" },
      { code: "RF", nameEn: "Ring Fixed", nameCn: "固定戒指" },
      { code: "RA", nameEn: "Ring Adjustable", nameCn: "可调节戒指" },
      { code: "ES", nameEn: "Earring Stud", nameCn: "耳钉" },
      { code: "ED", nameEn: "Earring Drop", nameCn: "耳坠" },
      { code: "NE", nameEn: "Necklace", nameCn: "项链" },
      { code: "BC", nameEn: "Bracelet Chain", nameCn: "手链" },
      { code: "BB", nameEn: "Bracelet Bangle", nameCn: "手环" },
      { code: "AN", nameEn: "Anklet", nameCn: "脚链" },
      { code: "WC", nameEn: "Waist Chain", nameCn: "腰链" },
      { code: "PI", nameEn: "Piercing", nameCn: "穿刺饰品" },
    ],
  },
  {
    id: "material",
    name: "材料代码",
    codeLength: 2,
    isRequired: false,
    order: 3,
    options: [
      { code: "", nameEn: "None", nameCn: "不选择" },
      { code: "GM", nameEn: "Gold Metal", nameCn: "金色金属" },
      { code: "SM", nameEn: "Silver Metal", nameCn: "银色金属" },
      { code: "DM", nameEn: "Diamond", nameCn: "钻石" },
      { code: "PE", nameEn: "Pearl", nameCn: "珍珠" },
      { code: "GS", nameEn: "Gemstone", nameCn: "宝石" },
      { code: "CR", nameEn: "Crystal", nameCn: "水晶" },
      { code: "IR", nameEn: "Iron", nameCn: "铁艺" },
      { code: "TX", nameEn: "Textile", nameCn: "布料" },
      { code: "WD", nameEn: "Wood", nameCn: "木质" },
      { code: "EN", nameEn: "Enamel", nameCn: "珐琅" },
      { code: "BO", nameEn: "Bone", nameCn: "骨质" },
      { code: "LT", nameEn: "Leather", nameCn: "皮革" },
      { code: "SH", nameEn: "Shell", nameCn: "贝壳" },
      { code: "FT", nameEn: "Feather", nameCn: "羽毛" },
    ],
  },
  {
    id: "color",
    name: "颜色代码",
    codeLength: 2,
    isRequired: false,
    order: 4,
    options: [
      { code: "", nameEn: "None", nameCn: "不选择" },
      { code: "RE", nameEn: "Red", nameCn: "红色", colorHex: "#FF0000" },
      { code: "BL", nameEn: "Blue", nameCn: "蓝色", colorHex: "#0000FF" },
      { code: "GR", nameEn: "Green", nameCn: "绿色", colorHex: "#00FF00" },
      { code: "YE", nameEn: "Yellow", nameCn: "黄色", colorHex: "#FFFF00" },
      { code: "BK", nameEn: "Black", nameCn: "黑色", colorHex: "#000000" },
      { code: "WH", nameEn: "White", nameCn: "白色", colorHex: "#FFFFFF" },
      { code: "PK", nameEn: "Pink", nameCn: "粉色", colorHex: "#FFC0CB" },
      { code: "OR", nameEn: "Orange", nameCn: "橙色", colorHex: "#FFA500" },
      { code: "PU", nameEn: "Purple", nameCn: "紫色", colorHex: "#800080" },
      { code: "SV", nameEn: "Silver", nameCn: "银色", colorHex: "#C0C0C0" },
      { code: "GD", nameEn: "Gold", nameCn: "金色", colorHex: "#FFD700" },
      { code: "BR", nameEn: "Brown", nameCn: "棕色", colorHex: "#8B4513" },
      { code: "MC", nameEn: "Multi-color", nameCn: "多色", colorHex: "#GRADIENT" },
      { code: "NT", nameEn: "Natural", nameCn: "原色", colorHex: "#DEB887" },
      { code: "GE", nameEn: "Grey", nameCn: "灰色", colorHex: "#808080" },
      { code: "DR", nameEn: "Dark Green", nameCn: "墨绿", colorHex: "#006400" },
    ],
  },
  {
    id: "serial",
    name: "流水号",
    codeLength: 4,
    isRequired: true,
    order: 5,
    isSerialNumber: true,
    options: [], // 流水号没有选项，自动生成
  },
];

/**
 * SKU 生成器服务 v2
 */
export const SkuGenerator = {
  // ==================== 段管理 ====================
  
  /**
   * 获取所有段定义
   * 自动迁移旧数据：添加流水号段和空值选项
   */
  async getSegments(): Promise<SkuSegment[]> {
    try {
      const data = await AsyncStorage.getItem(SKU_SEGMENTS_KEY);
      if (data) {
        let segments: SkuSegment[] = JSON.parse(data);
        let needsSave = false;
        
        // 迁移1: 检查是否有流水号段，没有则添加
        const hasSerialSegment = segments.some(s => s.isSerialNumber);
        if (!hasSerialSegment) {
          const maxOrder = Math.max(...segments.map(s => s.order), 0);
          segments.push({
            id: "serial",
            name: "流水号",
            codeLength: 4,
            isRequired: true,
            order: maxOrder + 1,
            isSerialNumber: true,
            options: [],
          });
          needsSave = true;
        }
        
        // 迁移2: 为每个非流水号段添加空值选项（如果没有）
        segments = segments.map(seg => {
          if (seg.isSerialNumber) return seg;
          
          const hasEmptyOption = seg.options.some(o => o.code === '');
          if (!hasEmptyOption) {
            needsSave = true;
            return {
              ...seg,
              isRequired: false, // 改为非必填
              options: [
                { code: '', nameEn: 'None', nameCn: '不选择' },
                ...seg.options,
              ],
            };
          }
          return seg;
        });
        
        // 如果有迁移，保存更新后的数据
        if (needsSave) {
          await this.saveSegments(segments);
        }
        
        return segments;
      }
      // 首次使用，返回默认段并保存
      await this.saveSegments(DEFAULT_SEGMENTS);
      return DEFAULT_SEGMENTS;
    } catch (error) {
      console.error("[SkuGenerator] Failed to get segments:", error);
      return DEFAULT_SEGMENTS;
    }
  },

  /**
   * 保存段定义
   */
  async saveSegments(segments: SkuSegment[]): Promise<void> {
    try {
      await AsyncStorage.setItem(SKU_SEGMENTS_KEY, JSON.stringify(segments));
    } catch (error) {
      console.error("[SkuGenerator] Failed to save segments:", error);
    }
  },

  /**
   * 添加新段
   */
  async addSegment(segment: Omit<SkuSegment, "id" | "order">): Promise<SkuSegment> {
    const segments = await this.getSegments();
    const newSegment: SkuSegment = {
      ...segment,
      id: `custom_${Date.now()}`,
      order: segments.length + 1,
    };
    segments.push(newSegment);
    await this.saveSegments(segments);
    return newSegment;
  },

  /**
   * 删除段
   */
  async deleteSegment(segmentId: string): Promise<void> {
    const segments = await this.getSegments();
    const filtered = segments.filter(s => s.id !== segmentId);
    // 重新排序
    filtered.forEach((s, i) => s.order = i + 1);
    await this.saveSegments(filtered);
  },

  /**
   * 移动段的位置（上移或下移）
   */
  async moveSegment(segmentId: string, direction: 'up' | 'down'): Promise<void> {
    const segments = await this.getSegments();
    const sortedSegments = [...segments].sort((a, b) => a.order - b.order);
    const index = sortedSegments.findIndex(s => s.id === segmentId);
    
    if (index === -1) return;
    
    // 检查边界
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sortedSegments.length - 1) return;
    
    // 交换位置
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = sortedSegments[index];
    sortedSegments[index] = sortedSegments[swapIndex];
    sortedSegments[swapIndex] = temp;
    
    // 重新设置 order
    sortedSegments.forEach((s, i) => s.order = i + 1);
    
    await this.saveSegments(sortedSegments);
  },

  /**
   * 重新排序所有段（根据新的顺序数组）
   */
  async reorderSegments(segmentIds: string[]): Promise<void> {
    const segments = await this.getSegments();
    const segmentMap = new Map(segments.map(s => [s.id, s]));
    
    const reorderedSegments: SkuSegment[] = [];
    segmentIds.forEach((id, index) => {
      const segment = segmentMap.get(id);
      if (segment) {
        segment.order = index + 1;
        reorderedSegments.push(segment);
      }
    });
    
    // 添加未在列表中的段（如果有的话）
    segments.forEach(s => {
      if (!segmentIds.includes(s.id)) {
        s.order = reorderedSegments.length + 1;
        reorderedSegments.push(s);
      }
    });
    
    await this.saveSegments(reorderedSegments);
  },

  /**
   * 更新段
   */
  async updateSegment(segmentId: string, updates: Partial<SkuSegment>): Promise<void> {
    const segments = await this.getSegments();
    const index = segments.findIndex(s => s.id === segmentId);
    if (index !== -1) {
      segments[index] = { ...segments[index], ...updates };
      await this.saveSegments(segments);
    }
  },

  /**
   * 向段添加选项
   */
  async addOptionToSegment(segmentId: string, option: CodeOption): Promise<void> {
    const segments = await this.getSegments();
    const segment = segments.find(s => s.id === segmentId);
    if (segment) {
      segment.options.push({ ...option, isCustom: true });
      await this.saveSegments(segments);
    }
  },

  /**
   * 从段删除选项
   */
  async removeOptionFromSegment(segmentId: string, code: string): Promise<void> {
    const segments = await this.getSegments();
    const segment = segments.find(s => s.id === segmentId);
    if (segment) {
      segment.options = segment.options.filter(o => o.code !== code);
      await this.saveSegments(segments);
    }
  },

  // ==================== 序列管理 ====================

  /**
   * 获取所有序列记录
   */
  async getAllSequences(): Promise<Record<string, SkuSequence>> {
    try {
      const data = await AsyncStorage.getItem(SKU_SEQUENCE_KEY);
      if (!data) return {};
      const parsed = JSON.parse(data);
      // 验证数据格式
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.warn("[SkuGenerator] Sequences data is not an object, resetting");
        return {};
      }
      // 过滤无效记录
      const validSequences: Record<string, SkuSequence> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object' && 'prefix' in value) {
          validSequences[key] = value as SkuSequence;
        }
      }
      return validSequences;
    } catch (error) {
      console.error("[SkuGenerator] Failed to get sequences:", error);
      return {};
    }
  },

  /**
   * 保存序列记录
   */
  async saveSequences(sequences: Record<string, SkuSequence>): Promise<void> {
    try {
      await AsyncStorage.setItem(SKU_SEQUENCE_KEY, JSON.stringify(sequences));
    } catch (error) {
      console.error("[SkuGenerator] Failed to save sequences:", error);
    }
  },

  /**
   * 获取下一个流水号
   */
  async getNextNumber(prefix: string): Promise<number> {
    const sequences = await this.getAllSequences();
    const sequence = sequences[prefix];
    return sequence ? sequence.lastNumber + 1 : 1;
  },

  /**
   * 设置流水号（手动调整）
   */
  async setSequenceNumber(prefix: string, number: number): Promise<void> {
    const sequences = await this.getAllSequences();
    sequences[prefix] = {
      prefix,
      lastNumber: number,
      updatedAt: new Date().toISOString(),
    };
    await this.saveSequences(sequences);
  },

  /**
   * 重置流水号为0
   */
  async resetSequence(prefix: string): Promise<void> {
    const sequences = await this.getAllSequences();
    if (sequences[prefix]) {
      sequences[prefix].lastNumber = 0;
      sequences[prefix].updatedAt = new Date().toISOString();
      await this.saveSequences(sequences);
    }
  },

  /**
   * 删除序列记录
   */
  async deleteSequence(prefix: string): Promise<void> {
    const sequences = await this.getAllSequences();
    delete sequences[prefix];
    await this.saveSequences(sequences);
  },

  /**
   * 增加流水号
   */
  async incrementSequence(prefix: string, amount: number = 1): Promise<number> {
    const sequences = await this.getAllSequences();
    const current = sequences[prefix]?.lastNumber || 0;
    const newNumber = Math.max(0, current + amount);
    sequences[prefix] = {
      prefix,
      lastNumber: newNumber,
      updatedAt: new Date().toISOString(),
    };
    await this.saveSequences(sequences);
    return newNumber;
  },

  // ==================== SKU 生成 ====================

  /**
   * 生成 SKU 前缀（只取流水号之前的段，用于判断流水号递增）
   * 注意：流水号之后的段（如颜色）不参与前缀计算
   * 例如：LB-ED-IR-HW-0001-BR 和 LB-ED-IR-HW-0001-SV 的前缀都是 LB-ED-IR-HW
   */
  generatePrefix(segmentValues: Record<string, string>, segments: SkuSegment[]): string {
    const sortedSegments = [...segments].sort((a, b) => a.order - b.order);
    const serialIndex = sortedSegments.findIndex(s => s.isSerialNumber);
    
    // 只取流水号之前的段
    const prefixSegments = serialIndex >= 0 
      ? sortedSegments.slice(0, serialIndex)
      : sortedSegments.filter(s => !s.isSerialNumber);
    
    return prefixSegments
      .map(s => segmentValues[s.id] || "")
      .filter(v => v)
      .join("-");
  },

  /**
   * 生成 SKU 后缀（流水号之后的段，如颜色）
   */
  generateSuffix(segmentValues: Record<string, string>, segments: SkuSegment[]): string {
    const sortedSegments = [...segments].sort((a, b) => a.order - b.order);
    const serialIndex = sortedSegments.findIndex(s => s.isSerialNumber);
    
    if (serialIndex < 0 || serialIndex >= sortedSegments.length - 1) {
      return ""; // 没有流水号或流水号在最后，没有后缀
    }
    
    // 取流水号之后的段
    const suffixSegments = sortedSegments.slice(serialIndex + 1);
    
    return suffixSegments
      .map(s => segmentValues[s.id] || "")
      .filter(v => v)
      .join("-");
  },

  /**
   * 预览 SKU（不更新序列）
   * 支持流水号位置可调
   */
  async previewSku(segmentValues: Record<string, string>, segments: SkuSegment[]): Promise<string> {
    const prefix = this.generatePrefix(segmentValues, segments);
    const nextNumber = await this.getNextNumber(prefix);
    const paddedNumber = nextNumber.toString().padStart(4, "0");
    
    // 找到流水号段的位置
    const serialSegment = segments.find(s => s.isSerialNumber);
    if (!serialSegment) {
      // 如果没有流水号段，默认放在最后
      return `${prefix}-${paddedNumber}`;
    }
    
    // 按顺序组装 SKU，流水号放在其 order 位置
    const sortedSegments = [...segments].sort((a, b) => a.order - b.order);
    const parts: string[] = [];
    
    for (const seg of sortedSegments) {
      if (seg.isSerialNumber) {
        parts.push(paddedNumber);
      } else {
        const value = segmentValues[seg.id];
        if (value) {
          parts.push(value);
        }
      }
    }
    
    return parts.join("-");
  },

  /**
   * 获取流水号在 SKU 中的位置索引
   */
  getSerialNumberPosition(segments: SkuSegment[]): number {
    const sortedSegments = [...segments].sort((a, b) => a.order - b.order);
    return sortedSegments.findIndex(s => s.isSerialNumber);
  },

  /**
   * 确认使用 SKU（更新序列和历史）
   * 支持流水号在任意位置
   * 
   * 重要：前缀只取流水号之前的部分，流水号之后的部分（如颜色）不参与前缀计算
   * 例如：LB-ED-IR-HW-0001-BR 和 LB-ED-IR-HW-0001-SV 的前缀都是 LB-ED-IR-HW
   */
  async confirmSku(sku: string, segmentValues: Record<string, string>, segments?: SkuSegment[]): Promise<void> {
    const parts = sku.split("-");
    
    // 如果提供了 segments，根据流水号位置提取
    let number: number;
    let prefix: string;
    
    if (segments) {
      const serialPosition = this.getSerialNumberPosition(segments);
      if (serialPosition >= 0 && serialPosition < parts.length) {
        number = parseInt(parts[serialPosition], 10);
        // 前缀只取流水号之前的部分（不包含流水号之后的颜色等）
        prefix = parts.slice(0, serialPosition).join("-");
      } else {
        // 默认流水号在最后
        number = parseInt(parts[parts.length - 1], 10);
        prefix = parts.slice(0, -1).join("-");
      }
    } else {
      // 智能识别流水号位置：从后往前找第一个纯数字部分
      // 例如：LB-ED-IR-0002-RE 中，RE 不是数字，0002 是数字
      let serialIndex = parts.length - 1;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (/^\d+$/.test(parts[i])) {
          serialIndex = i;
          break;
        }
      }
      
      number = parseInt(parts[serialIndex], 10);
      // 前缀只取流水号之前的部分
      prefix = parts.slice(0, serialIndex).join("-");
      
      // 如果解析失败（没有找到数字部分），使用默认值
      if (isNaN(number)) {
        number = 0;
        prefix = parts.slice(0, -1).join("-");
      }
    }

    // 更新序列（只根据前缀判断）
    const sequences = await this.getAllSequences();
    const currentSequence = sequences[prefix];
    
    if (!currentSequence || number > currentSequence.lastNumber) {
      sequences[prefix] = {
        prefix,
        lastNumber: number,
        updatedAt: new Date().toISOString(),
      };
      await this.saveSequences(sequences);
    }

    // 添加历史记录
    await this.addHistoryRecord({
      sku,
      prefix,
      number,
      createdAt: new Date().toISOString(),
      segments: segmentValues,
    });
  },

  // ==================== 历史记录管理 ====================

  /**
   * 获取所有历史记录
   */
  async getHistory(): Promise<SkuHistoryRecord[]> {
    try {
      const data = await AsyncStorage.getItem(SKU_HISTORY_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      // 验证数据格式
      if (!Array.isArray(parsed)) {
        console.warn("[SkuGenerator] History data is not an array, resetting");
        return [];
      }
      // 过滤无效记录
      return parsed.filter(record => 
        record && 
        typeof record === 'object' && 
        typeof record.sku === 'string'
      );
    } catch (error) {
      console.error("[SkuGenerator] Failed to get history:", error);
      return [];
    }
  },

  /**
   * 添加历史记录
   */
  async addHistoryRecord(record: SkuHistoryRecord): Promise<void> {
    try {
      const history = await this.getHistory();
      // 检查是否已存在
      if (!history.find(h => h.sku === record.sku)) {
        history.unshift(record); // 添加到开头
        // 限制历史记录数量（最多保留 1000 条）
        if (history.length > 1000) {
          history.pop();
        }
        await AsyncStorage.setItem(SKU_HISTORY_KEY, JSON.stringify(history));
      }
    } catch (error) {
      console.error("[SkuGenerator] Failed to add history:", error);
    }
  },

  /**
   * 删除历史记录
   */
  async deleteHistoryRecord(sku: string): Promise<void> {
    try {
      const history = await this.getHistory();
      const filtered = history.filter(h => h.sku !== sku);
      await AsyncStorage.setItem(SKU_HISTORY_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error("[SkuGenerator] Failed to delete history:", error);
    }
  },

  /**
   * 清空历史记录
   */
  async clearHistory(): Promise<void> {
    try {
      await AsyncStorage.setItem(SKU_HISTORY_KEY, JSON.stringify([]));
    } catch (error) {
      console.error("[SkuGenerator] Failed to clear history:", error);
    }
  },

  /**
   * 按前缀筛选历史记录
   */
  async getHistoryByPrefix(prefix: string): Promise<SkuHistoryRecord[]> {
    const history = await this.getHistory();
    return history.filter(h => h.prefix === prefix);
  },

  // ==================== 兼容旧版本 ====================

  /**
   * 从现有产品同步序列（兼容旧版本）
   * 支持带颜色后缀的 SKU，如 LB-ED-IR-0002-RE
   */
  async syncFromProducts(skus: string[]): Promise<void> {
    const sequences: Record<string, SkuSequence> = {};

    for (const sku of skus) {
      const parts = sku.split("-");
      if (parts.length < 2) continue;

      // 智能识别流水号位置：从后往前找第一个纯数字部分
      let serialIndex = -1;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (/^\d+$/.test(parts[i])) {
          serialIndex = i;
          break;
        }
      }
      
      if (serialIndex < 0) continue; // 没有找到数字部分，跳过
      
      const number = parseInt(parts[serialIndex], 10);
      if (isNaN(number)) continue;

      // 前缀只取流水号之前的部分
      const prefix = parts.slice(0, serialIndex).join("-");
      const current = sequences[prefix];
      if (!current || number > current.lastNumber) {
        sequences[prefix] = {
          prefix,
          lastNumber: number,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    // 合并现有序列
    const existingSequences = await this.getAllSequences();
    for (const [prefix, sequence] of Object.entries(existingSequences)) {
      if (!sequences[prefix] || sequences[prefix].lastNumber < sequence.lastNumber) {
        sequences[prefix] = sequence;
      }
    }

    await this.saveSequences(sequences);
  },

  // ==================== 上次选择管理 ====================

  /**
   * 保存上次的段选择
   */
  async saveLastSelection(segmentValues: Record<string, string>): Promise<void> {
    try {
      await AsyncStorage.setItem(SKU_LAST_SELECTION_KEY, JSON.stringify(segmentValues));
    } catch (error) {
      console.error("[SkuGenerator] Failed to save last selection:", error);
    }
  },

  /**
   * 获取上次的段选择
   */
  async getLastSelection(): Promise<Record<string, string> | null> {
    try {
      const data = await AsyncStorage.getItem(SKU_LAST_SELECTION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("[SkuGenerator] Failed to get last selection:", error);
      return null;
    }
  },
};

// 导出旧版本兼容的常量
export const BRAND_CODES = DEFAULT_SEGMENTS.find(s => s.id === "brand")?.options || [];
export const CATEGORY_CODES = DEFAULT_SEGMENTS.find(s => s.id === "category")?.options || [];
export const MATERIAL_CODES = DEFAULT_SEGMENTS.find(s => s.id === "material")?.options || [];
export const COLOR_CODES = DEFAULT_SEGMENTS.find(s => s.id === "color")?.options || [];
