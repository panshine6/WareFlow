/**
 * AI 辅助款式 SKU 查重功能测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { compareImageSimilarity, batchCompareImages } from "../ai-vision";
import { ProductStorage } from "../storage";
import type { Product } from "@/types/product";

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

// Mock fetch for OpenAI API
global.fetch = vi.fn();

describe("AI 图片相似度对比功能", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该正确对比两张图片的相似度", async () => {
    // Mock OpenAI API 响应
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                similarityScore: 95,
                analysisNote: "两张图片为同一款产品，材质和设计完全相同",
              }),
            },
          },
        ],
      }),
    });

    const result = await compareImageSimilarity("base64_image_1", "base64_image_2");

    expect(result.similarityScore).toBe(95);
    expect(result.analysisNote).toContain("同一款产品");
  });

  it("应该正确处理批量对比", async () => {
    // Mock 多次 API 调用
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  similarityScore: 92,
                  analysisNote: "款式相同，颜色略有差异",
                }),
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  similarityScore: 85,
                  analysisNote: "材质相似，但设计不同",
                }),
              },
            },
          ],
        }),
      });

    const existingImages = [
      { id: "product-1", base64: "base64_existing_1" },
      { id: "product-2", base64: "base64_existing_2" },
    ];

    const results = await batchCompareImages("base64_new_image", existingImages, 90);

    // 只应该返回相似度 >= 90 的结果
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("product-1");
    expect(results[0].similarityScore).toBe(92);
  });
});

describe("产品合并和历史记录功能", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该正确合并产品并记录历史", async () => {
    const existingProduct: Product = {
      id: "product-1",
      sku: "ACC-001",
      quantity: 10,
      storageLocation: "A-01",
      detailImageUri: "file:///detail1.jpg",
      overviewImageUri: "file:///overview1.jpg",
      createdAt: "2024-01-01T00:00:00.000Z",
      operatorName: "张三",
      operatorId: "user-1",
      history: [
        {
          id: "history-1",
          timestamp: "2024-01-01T00:00:00.000Z",
          operatorId: "user-1",
          operatorName: "张三",
          quantity: 10,
          location: "A-01",
          detailImageUri: "file:///detail1.jpg",
          overviewImageUri: "file:///overview1.jpg",
        },
      ],
    };

    // Mock getAll 返回现有产品
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    (AsyncStorage.getItem as any).mockResolvedValueOnce(JSON.stringify([existingProduct]));

    await ProductStorage.mergeProduct("product-1", {
      quantity: 5,
      location: "A-02",
      detailImageUri: "file:///detail2.jpg",
      overviewImageUri: "file:///overview2.jpg",
      operatorId: "user-2",
      operatorName: "李四",
    });

    // 验证 setItem 被调用
    expect(AsyncStorage.setItem).toHaveBeenCalled();

    // 获取保存的数据
    const savedData = (AsyncStorage.setItem as any).mock.calls[0][1];
    const products = JSON.parse(savedData);

    // 验证数量累加
    expect(products[0].quantity).toBe(15);

    // 验证历史记录
    expect(products[0].history.length).toBe(2);
    expect(products[0].history[1].quantity).toBe(5);
    expect(products[0].history[1].operatorName).toBe("李四");
  });

  it("应该正确创建带历史记录的新产品", async () => {
    // Mock getAll 返回空数组
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    (AsyncStorage.getItem as any).mockResolvedValueOnce(JSON.stringify([]));

    const newProduct = {
      id: "product-2",
      sku: "ACC-002",
      quantity: 8,
      storageLocation: "B-01",
      detailImageUri: "file:///detail3.jpg",
      overviewImageUri: "file:///overview3.jpg",
      createdAt: "2024-01-02T00:00:00.000Z",
      operatorName: "王五",
      operatorId: "user-3",
    };

    await ProductStorage.addWithHistory(newProduct);

    // 验证 setItem 被调用
    expect(AsyncStorage.setItem).toHaveBeenCalled();

    // 获取保存的数据
    const savedData = (AsyncStorage.setItem as any).mock.calls[0][1];
    const products = JSON.parse(savedData);

    // 验证产品已添加
    expect(products.length).toBe(1);

    // 验证历史记录已创建
    expect(products[0].history).toBeDefined();
    expect(products[0].history.length).toBe(1);
    expect(products[0].history[0].quantity).toBe(8);
    expect(products[0].history[0].operatorName).toBe("王五");
  });
});

describe("查重流程集成测试", () => {
  it("应该在没有现有产品时直接创建新产品", async () => {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    (AsyncStorage.getItem as any).mockResolvedValueOnce(JSON.stringify([]));

    const allProducts = await ProductStorage.getAll();
    expect(allProducts.length).toBe(0);

    // 应该跳过查重，直接创建新产品
  });

  it("应该在相似度低于阈值时创建新产品", async () => {
    // Mock OpenAI API 返回低相似度
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                similarityScore: 75,
                analysisNote: "款式不同",
              }),
            },
          },
        ],
      }),
    });

    const result = await compareImageSimilarity("base64_new", "base64_existing");

    expect(result.similarityScore).toBeLessThan(90);
    // 应该创建新产品而不是合并
  });

  it("应该在相似度高于阈值时提示用户确认", async () => {
    // Mock OpenAI API 返回高相似度
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                similarityScore: 95,
                analysisNote: "完全相同的款式",
              }),
            },
          },
        ],
      }),
    });

    const result = await compareImageSimilarity("base64_new", "base64_existing");

    expect(result.similarityScore).toBeGreaterThanOrEqual(90);
    // 应该导航到查重结果页面
  });
});
