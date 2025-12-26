/**
 * AI 图像识别工具
 * 使用 OpenAI Vision API 识别图片中的饰品数量
 */

/**
 * 识别图片中的饰品数量
 * @param imageBase64 Base64 编码的图片数据
 * @returns 识别到的数量
 */
export async function countProductsInImage(
  imageBase64: string,
): Promise<number> {
  // 从环境变量获取 API 密钥
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("未配置 OpenAI API 密钥，请联系管理员");
  }
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `请仔细观察这张图片，计算图片中时尚饰品的数量。

识别要点：
1. 每个饰品都附有一个白色标签（约3cm×5cm）
2. 饰品放置在深色背景上，便于识别
3. 请数清楚所有可见的白色标签数量
4. 如果有重叠或遮挡，请尽量估算

请只返回一个数字，表示饰品的总数量。`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "low", // 使用低分辨率以节省成本
                },
              },
            ],
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "0";

    // 提取数字
    const match = content.match(/\d+/);
    const count = match ? parseInt(match[0], 10) : 0;

    return count;
  } catch (error) {
    console.error("AI vision error:", error);
    throw new Error("图像识别失败，请重试或手动输入数量");
  }
}

/**
 * 验证 API 密钥是否有效
 */
export async function validateApiKey(): Promise<boolean> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  
  if (!apiKey) {
    return false;
  }
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
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
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("未配置 OpenAI API 密钥，请联系管理员");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `你是一位专业的时尚饰品鉴定专家。请对比这两张饰品细节图，判断它们是否为同一款产品。

对比要点：
1. 材质和质感（金属、塑料、布料等）
2. 颜色和色调
3. 形状和尺寸
4. 图案和纹理
5. 装饰元素（珠子、吊坠、扣子等）
6. 整体设计风格

请返回 JSON 格式的结果：
{
  "similarityScore": 0-100 的整数（100 表示完全相同，0 表示完全不同），
  "analysisNote": "简短的对比分析说明（不超过50字）"
}

注意：
- 即使拍摄角度、光线不同，只要款式相同就应该给出高分（≥90）
- 如果只是颜色不同但款式相同，也应该给出较高分（≥85）
- 只有在材质、形状、设计明显不同时才给出低分（<80）`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64_1}`,
                  detail: "high", // 使用高分辨率以识别细节
                },
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64_2}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("API error:", errorData);
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "{}";

    // 解析 JSON 结果
    const result = JSON.parse(content);
    
    return {
      similarityScore: result.similarityScore || 0,
      analysisNote: result.analysisNote || "无法分析",
    };
  } catch (error) {
    console.error("Image similarity comparison error:", error);
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
  const results: Array<{ id: string; similarityScore: number; analysisNote: string }> = [];

  // 逐个对比（注意：这会产生多次 API 调用）
  for (const existingImage of existingImages) {
    try {
      const comparison = await compareImageSimilarity(newImageBase64, existingImage.base64);
      
      // 只保留高于阈值的结果
      if (comparison.similarityScore >= threshold) {
        results.push({
          id: existingImage.id,
          similarityScore: comparison.similarityScore,
          analysisNote: comparison.analysisNote,
        });
      }
    } catch (error) {
      console.error(`Failed to compare with image ${existingImage.id}:`, error);
      // 继续处理下一张图片
    }
  }

  // 按相似度降序排列
  results.sort((a, b) => b.similarityScore - a.similarityScore);

  return results;
}
