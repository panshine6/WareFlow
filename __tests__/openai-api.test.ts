import { describe, it, expect } from "vitest";

describe("OpenAI API Key Validation", () => {
  it("should validate OpenAI API key by calling models endpoint", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    
    expect(apiKey).toBeDefined();
    expect(apiKey).toMatch(/^sk-/);

    // 调用 OpenAI API 的 models 端点验证密钥
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
  }, 30000); // 30 秒超时
});
