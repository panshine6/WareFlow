/**
 * SKU 生成助手
 * 
 * SKU 格式: [品牌代码(2位)]-[大类代码(2位)]-[材料代码(2位)]-[颜色代码(2位)]-[流水号(4位)]
 * 示例: LB-ES-CR-RE-0001 = Ladybuty 耳钉 水晶 红色 第1号
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// SKU 序列存储键
const SKU_SEQUENCE_KEY = "sku_sequences";

// 代码选项接口
export interface CodeOption {
  code: string;
  nameEn: string;
  nameCn: string;
}

// 预设品牌代码
export const BRAND_CODES: CodeOption[] = [
  { code: "LB", nameEn: "Ladybuty", nameCn: "Ladybuty" },
];

// 预设大类代码
export const CATEGORY_CODES: CodeOption[] = [
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
];

// 预设材料代码
export const MATERIAL_CODES: CodeOption[] = [
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
];

// 预设颜色代码
export const COLOR_CODES: CodeOption[] = [
  { code: "RE", nameEn: "Red", nameCn: "红色" },
  { code: "BL", nameEn: "Blue", nameCn: "蓝色" },
  { code: "GR", nameEn: "Green", nameCn: "绿色" },
  { code: "YE", nameEn: "Yellow", nameCn: "黄色" },
  { code: "BK", nameEn: "Black", nameCn: "黑色" },
  { code: "WH", nameEn: "White", nameCn: "白色" },
  { code: "PK", nameEn: "Pink", nameCn: "粉色" },
  { code: "OR", nameEn: "Orange", nameCn: "橙色" },
  { code: "PU", nameEn: "Purple", nameCn: "紫色" },
  { code: "SV", nameEn: "Silver", nameCn: "银色" },
  { code: "GD", nameEn: "Gold", nameCn: "金色" },
  { code: "BR", nameEn: "Brown", nameCn: "棕色" },
  { code: "MC", nameEn: "Multi-color", nameCn: "多色" },
  { code: "NT", nameEn: "Natural", nameCn: "原色" },
];

// SKU 序列记录
export interface SkuSequence {
  prefix: string; // 前缀，如 "LB-ES-CR-RE"
  lastNumber: number; // 最后使用的流水号
  updatedAt: string; // 最后更新时间
}

// SKU 生成参数
export interface SkuGeneratorParams {
  brand: string;
  category: string;
  material: string;
  color: string;
}

/**
 * SKU 生成器服务
 */
export const SkuGenerator = {
  /**
   * 获取所有序列记录
   */
  async getAllSequences(): Promise<Record<string, SkuSequence>> {
    try {
      const data = await AsyncStorage.getItem(SKU_SEQUENCE_KEY);
      return data ? JSON.parse(data) : {};
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
   * 生成 SKU 前缀
   */
  generatePrefix(params: SkuGeneratorParams): string {
    return `${params.brand}-${params.category}-${params.material}-${params.color}`;
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
   * 生成完整的 SKU
   */
  async generateSku(params: SkuGeneratorParams): Promise<string> {
    const prefix = this.generatePrefix(params);
    const nextNumber = await this.getNextNumber(prefix);
    const paddedNumber = nextNumber.toString().padStart(4, "0");
    return `${prefix}-${paddedNumber}`;
  },

  /**
   * 预览 SKU（不更新序列）
   */
  async previewSku(params: SkuGeneratorParams): Promise<string> {
    const prefix = this.generatePrefix(params);
    const nextNumber = await this.getNextNumber(prefix);
    const paddedNumber = nextNumber.toString().padStart(4, "0");
    return `${prefix}-${paddedNumber}`;
  },

  /**
   * 确认使用 SKU（更新序列）
   */
  async confirmSku(sku: string): Promise<void> {
    // 解析 SKU
    const parts = sku.split("-");
    if (parts.length !== 5) {
      console.error("[SkuGenerator] Invalid SKU format:", sku);
      return;
    }

    const prefix = parts.slice(0, 4).join("-");
    const number = parseInt(parts[4], 10);

    // 更新序列
    const sequences = await this.getAllSequences();
    const currentSequence = sequences[prefix];
    
    // 只有当新号码大于当前记录时才更新
    if (!currentSequence || number > currentSequence.lastNumber) {
      sequences[prefix] = {
        prefix,
        lastNumber: number,
        updatedAt: new Date().toISOString(),
      };
      await this.saveSequences(sequences);
      console.log(`[SkuGenerator] Updated sequence for ${prefix}: ${number}`);
    }
  },

  /**
   * 从现有产品同步序列
   * 用于初始化或修复序列数据
   */
  async syncFromProducts(skus: string[]): Promise<void> {
    const sequences: Record<string, SkuSequence> = {};

    for (const sku of skus) {
      const parts = sku.split("-");
      if (parts.length !== 5) continue;

      const prefix = parts.slice(0, 4).join("-");
      const number = parseInt(parts[4], 10);

      if (isNaN(number)) continue;

      const current = sequences[prefix];
      if (!current || number > current.lastNumber) {
        sequences[prefix] = {
          prefix,
          lastNumber: number,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    // 合并现有序列（保留较大的值）
    const existingSequences = await this.getAllSequences();
    for (const [prefix, sequence] of Object.entries(existingSequences)) {
      if (!sequences[prefix] || sequences[prefix].lastNumber < sequence.lastNumber) {
        sequences[prefix] = sequence;
      }
    }

    await this.saveSequences(sequences);
    console.log("[SkuGenerator] Synced sequences from products:", Object.keys(sequences).length);
  },

  /**
   * 获取指定前缀的当前序列信息
   */
  async getSequenceInfo(prefix: string): Promise<SkuSequence | null> {
    const sequences = await this.getAllSequences();
    return sequences[prefix] || null;
  },

  /**
   * 解析 SKU 获取各部分信息
   */
  parseSku(sku: string): SkuGeneratorParams & { number: number } | null {
    const parts = sku.split("-");
    if (parts.length !== 5) return null;

    return {
      brand: parts[0],
      category: parts[1],
      material: parts[2],
      color: parts[3],
      number: parseInt(parts[4], 10),
    };
  },

  /**
   * 验证 SKU 格式是否正确
   */
  validateSku(sku: string): boolean {
    const parts = sku.split("-");
    if (parts.length !== 5) return false;

    const [brand, category, material, color, number] = parts;
    
    // 检查各部分长度
    if (brand.length !== 2) return false;
    if (category.length !== 2) return false;
    if (material.length !== 2) return false;
    if (color.length !== 2) return false;
    if (number.length !== 4) return false;

    // 检查流水号是否为数字
    if (isNaN(parseInt(number, 10))) return false;

    return true;
  },
};
