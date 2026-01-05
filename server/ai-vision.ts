/**
 * AI 视觉识别服务（后端）
 * 使用 OpenAI Vision API 进行图像识别
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

/**
 * 识别图片中的饰品数量
 */
export async function countProductsInImage(imageBase64: string): Promise<number> {
  if (!OPENAI_API_KEY) {
    throw new Error("未配置 OpenAI API 密钥");
  }

  // 添加调试日志
  console.log("[AI Vision] countProductsInImage called");
  console.log("[AI Vision] Image base64 length:", imageBase64?.length || 0);

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are counting jewelry product packages for inventory management.

Each package is:
- A clear plastic bag with a white/cream display card inside
- Display cards are approximately 3cm x 5cm
- Placed on a dark background

CRITICAL RULES:
1. Count ONLY clearly visible, complete packages
2. If a package is partially hidden or unclear, do NOT count it
3. Price tags are attached to packages - do NOT count them separately
4. Reflections and shadows are NOT packages
5. When in doubt, DO NOT count

It is better to undercount than overcount. The user can manually add missing items, but removing incorrectly counted items is frustrating.

Scan the image carefully and return ONLY a single number.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", errorData);
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "0";
    console.log("[AI Vision] OpenAI response content:", content);
    
    const match = content.match(/\d+/);
    const count = match ? parseInt(match[0], 10) : 0;
    console.log("[AI Vision] Parsed count:", count);
    
    return count;
  } catch (error) {
    console.error("AI vision count error:", error);
    throw error;
  }
}

/**
 * 对比两张图片的相似度
 */
export async function compareImageSimilarity(
  imageBase64_1: string,
  imageBase64_2: string
): Promise<{ similarityScore: number; analysisNote: string }> {
  if (!OPENAI_API_KEY) {
    throw new Error("未配置 OpenAI API 密钥");
  }

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
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
                  detail: "high",
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
      console.error("OpenAI API error:", errorData);
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    return {
      similarityScore: result.similarityScore || 0,
      analysisNote: result.analysisNote || "无法分析",
    };
  } catch (error) {
    console.error("Image similarity comparison error:", error);
    throw error;
  }
}

/**
 * 从图片中识别条形码
 */
export async function scanBarcodeFromImage(imageBase64: string): Promise<{ barcodeValue: string | null; confidence: number }> {
  if (!OPENAI_API_KEY) {
    throw new Error("未配置 OpenAI API 密钥");
  }

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `请仔细观察这张图片，识别其中的条形码或二维码。

识别要点：
1. 查找图片中的条形码（Code 128 格式）或二维码
2. 读取条形码下方的文字内容（通常是 SKU 编号）
3. SKU 格式可能是：
   - 系统 SKU：BL + 6位日期 + 4位字符 + 1位校验位（如 BL260103EKBAM）
   - 用户 SKU：如 LB-ER-ME-0006
   - Box ID：如 LB-RF-GM-Box-1

请返回 JSON 格式的结果：
{
  "barcodeValue": "识别到的条形码内容，如果未识别到则为 null",
  "confidence": 0-100 的整数，表示识别置信度
}

注意：
- 优先读取条形码下方的文字
- 如果图片中没有条形码，返回 barcodeValue 为 null`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 100,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", errorData);
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    console.log("[AI Vision] Barcode scan result:", result);

    return {
      barcodeValue: result.barcodeValue || null,
      confidence: result.confidence || 0,
    };
  } catch (error) {
    console.error("Barcode scan error:", error);
    throw error;
  }
}

/**
 * 批量对比图片相似度（优化版：并行处理 + 超时限制）
 */
export async function batchCompareImages(
  newImageBase64: string,
  existingImages: Array<{ id: string; base64: string }>,
  threshold: number = 90
): Promise<Array<{ id: string; similarityScore: number; analysisNote: string }>> {
  console.log(`[AI Vision] Starting batch compare with ${existingImages.length} images, threshold: ${threshold}`);
  
  // 限制最多对比前 10 个产品（避免超时）
  const imagesToCompare = existingImages.slice(0, 10);
  
  if (imagesToCompare.length < existingImages.length) {
    console.log(`[AI Vision] Limited comparison to ${imagesToCompare.length} images (out of ${existingImages.length})`);
  }

  // 并行对比所有图片（带超时）
  const comparePromises = imagesToCompare.map(async (existingImage) => {
    try {
      // 设置 30 秒超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Comparison timeout")), 30000);
      });
      
      const comparisonPromise = compareImageSimilarity(newImageBase64, existingImage.base64);
      const comparison = await Promise.race([comparisonPromise, timeoutPromise]);
      
      if (comparison.similarityScore >= threshold) {
        console.log(`[AI Vision] Found similar image ${existingImage.id}: ${comparison.similarityScore}%`);
        return {
          id: existingImage.id,
          similarityScore: comparison.similarityScore,
          analysisNote: comparison.analysisNote,
        };
      }
      return null;
    } catch (error) {
      console.error(`[AI Vision] Failed to compare with image ${existingImage.id}:`, error);
      return null;
    }
  });

  const allResults = await Promise.all(comparePromises);
  const results = allResults.filter((r): r is { id: string; similarityScore: number; analysisNote: string } => r !== null);

  results.sort((a, b) => b.similarityScore - a.similarityScore);
  
  console.log(`[AI Vision] Batch compare completed: ${results.length} similar images found`);
  return results;
}

