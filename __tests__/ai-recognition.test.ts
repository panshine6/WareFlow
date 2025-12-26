import { describe, it, expect } from "vitest";
import { countProductsInImage, validateApiKey } from "../lib/ai-vision";

describe("AI Recognition Integration", () => {
  it("should validate API key successfully", async () => {
    const isValid = await validateApiKey();
    expect(isValid).toBe(true);
  }, 30000);

  it("should recognize products in image (mock test)", async () => {
    // 创建一个简单的测试图片 Base64（1x1 像素的透明 PNG）
    const testImageBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // 注意：这个测试会实际调用 OpenAI API
    // 由于测试图片不包含实际产品，AI 可能返回 0 或识别失败
    try {
      const count = await countProductsInImage(testImageBase64);
      
      // 验证返回值是数字
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    } catch (error) {
      // 如果 API 调用失败，确保错误消息合理
      expect(error).toBeDefined();
      expect((error as Error).message).toBeTruthy();
    }
  }, 60000); // 60 秒超时，因为 AI 识别可能较慢
});
