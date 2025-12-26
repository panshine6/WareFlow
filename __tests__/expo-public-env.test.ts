import { describe, it, expect } from "vitest";

describe("EXPO_PUBLIC Environment Variable", () => {
  it("should have EXPO_PUBLIC_OPENAI_API_KEY set", () => {
    const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    
    expect(apiKey).toBeDefined();
    expect(apiKey).toMatch(/^sk-/);
  });

  it("should validate API key by calling OpenAI models endpoint", async () => {
    const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  }, 30000);
});
