/**
 * AI 图像识别工具（前端）
 * 通过后端 API 调用 OpenAI Vision API
 */

// 获取 API 基础 URL
const getApiBaseUrl = () => {
  // 优先使用环境变量配置的 URL
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  // 默认使用 Railway 部署的后端
  return "https://web-production-e22eb.up.railway.app";
};

/**
 * 识别图片中的饰品数量
 * @param imageBase64 Base64 编码的图片数据
 * @returns 识别到的数量
 */
export async function countProductsInImage(
  imageBase64: string,
): Promise<number> {
  const apiBaseUrl = getApiBaseUrl();
  
  try {
    console.log("[AI Vision] Calling countProducts API...");
    
    const response = await fetch(`${apiBaseUrl}/api/trpc/ai.countProducts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          imageBase64,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AI Vision] API error:", errorText);
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[AI Vision] API response:", data);
    
    // tRPC 响应格式
    const count = data.result?.data?.json?.count ?? 0;
    return count;
  } catch (error) {
    console.error("[AI Vision] countProducts error:", error);
    throw new Error("图像识别失败，请重试或手动输入数量");
  }
}

/**
 * 验证 API 是否可用
 */
export async function validateApiKey(): Promise<boolean> {
  const apiBaseUrl = getApiBaseUrl();
  
  try {
    const response = await fetch(`${apiBaseUrl}/api/trpc/system.health`, {
      method: "GET",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 对比两张图片的相似度
 * @param imageBase64_1 第一张图片的 Base64 编码
 * @param imageBase64_2 第二张图片的 Base64 编码
 * @returns 相似度分数 (0-100) 和分析说明
 */
export async function compareImageSimilarity(
  imageBase64_1: string,
  imageBase64_2: string,
): Promise<{ similarityScore: number; analysisNote: string }> {
  const apiBaseUrl = getApiBaseUrl();

  try {
    console.log("[AI Vision] Calling compareSimilarity API...");
    
    const response = await fetch(`${apiBaseUrl}/api/trpc/ai.compareSimilarity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          imageBase64_1,
          imageBase64_2,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AI Vision] API error:", errorText);
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[AI Vision] API response:", data);
    
    // tRPC 响应格式
    const result = data.result?.data?.json ?? {};
    
    return {
      similarityScore: result.similarityScore || 0,
      analysisNote: result.analysisNote || "无法分析",
    };
  } catch (error) {
    console.error("[AI Vision] compareSimilarity error:", error);
    throw new Error("图片相似度对比失败，请重试");
  }
}

/**
 * 批量对比新图片与多张已有图片的相似度
 * @param newImageBase64 新图片的 Base64 编码
 * @param existingImages 已有图片列表 { id, base64 }
 * @param threshold 相似度阈值 (0-100)，只返回高于此阈值的结果
 * @returns 相似度结果列表，按相似度降序排列
 */
export async function batchCompareImages(
  newImageBase64: string,
  existingImages: Array<{ id: string; base64: string }>,
  threshold: number = 90,
): Promise<Array<{ id: string; similarityScore: number; analysisNote: string }>> {
  const apiBaseUrl = getApiBaseUrl();

  try {
    console.log("[AI Vision] Calling batchCompare API with", existingImages.length, "images...");
    
    const response = await fetch(`${apiBaseUrl}/api/trpc/ai.batchCompare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          newImageBase64,
          existingImages,
          threshold,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AI Vision] API error:", errorText);
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[AI Vision] API response:", data);
    
    // tRPC 响应格式
    const results = data.result?.data?.json?.results ?? [];
    return results;
  } catch (error) {
    console.error("[AI Vision] batchCompare error:", error);
    throw new Error("批量图片对比失败，请重试");
  }
}
