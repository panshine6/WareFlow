/**
 * AI 视觉识别服务（后端）
 * 使用 OpenAI Vision API 进行图像识别
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

// 速率限制配置
const RATE_LIMIT_DELAY = 1000; // 每次 API 调用之间的延迟（毫秒）
const MAX_RETRIES = 3; // 最大重试次数
const RETRY_DELAY = 2000; // 重试延迟（毫秒）

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的 API 调用
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('Too Many Requests') || 
                          error?.message?.includes('rate_limit');
      
      if (isRateLimit && i < retries - 1) {
        const waitTime = RETRY_DELAY * (i + 1); // 指数退避
        console.log(`[AI Vision] Rate limited, waiting ${waitTime}ms before retry ${i + 1}/${retries - 1}`);
        await delay(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

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

  return callWithRetry(async () => {
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
  });
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

  return callWithRetry(async () => {
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
                  detail: "low", // 使用 low 精度减少 token 消耗
                },
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64_2}`,
                  detail: "low", // 使用 low 精度减少 token 消耗
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
  });
}

/**
 * 从图片中识别条形码
 */
export async function scanBarcodeFromImage(imageBase64: string): Promise<{ barcodeValue: string | null; confidence: number }> {
  if (!OPENAI_API_KEY) {
    throw new Error("未配置 OpenAI API 密钥");
  }

  return callWithRetry(async () => {
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
  });
}

/**
 * 批量对比图片相似度（优化版：串行处理 + 速率限制 + 重试机制）
 */
export async function batchCompareImages(
  newImageBase64: string,
  existingImages: Array<{ id: string; base64: string }>,
  threshold: number = 90
): Promise<Array<{ id: string; similarityScore: number; analysisNote: string }>> {
  console.log(`[AI Vision] Starting batch compare with ${existingImages.length} images, threshold: ${threshold}`);
  
  // 限制最多对比前 5 个产品（减少 API 调用次数，避免速率限制）
  const imagesToCompare = existingImages.slice(0, 5);
  
  if (imagesToCompare.length < existingImages.length) {
    console.log(`[AI Vision] Limited comparison to ${imagesToCompare.length} images (out of ${existingImages.length})`);
  }

  const results: Array<{ id: string; similarityScore: number; analysisNote: string }> = [];

  // 串行处理，避免并发请求触发速率限制
  for (const existingImage of imagesToCompare) {
    try {
      console.log(`[AI Vision] Comparing with image ${existingImage.id}...`);
      
      const comparison = await compareImageSimilarity(newImageBase64, existingImage.base64);
      
      if (comparison.similarityScore >= threshold) {
        console.log(`[AI Vision] Found similar image ${existingImage.id}: ${comparison.similarityScore}%`);
        results.push({
          id: existingImage.id,
          similarityScore: comparison.similarityScore,
          analysisNote: comparison.analysisNote,
        });
      } else {
        console.log(`[AI Vision] Image ${existingImage.id} similarity: ${comparison.similarityScore}% (below threshold)`);
      }
      
      // 每次 API 调用后等待，避免触发速率限制
      await delay(RATE_LIMIT_DELAY);
      
    } catch (error) {
      console.error(`[AI Vision] Failed to compare with image ${existingImage.id}:`, error);
      // 继续处理其他图片，不中断整个流程
    }
  }

  results.sort((a, b) => b.similarityScore - a.similarityScore);
  
  console.log(`[AI Vision] Batch compare completed: ${results.length} similar images found`);
  return results;
}
