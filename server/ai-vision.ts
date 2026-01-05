/**
 * AI 视觉识别服务（后端）
 * 使用 OpenAI Vision API 进行图像识别
 * 优化版：使用 GPT-4o + 分区域计数法
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

// 使用 GPT-4o 模型（更强的视觉理解能力）
const VISION_MODEL = "gpt-4o";

// 速率限制配置
const RATE_LIMIT_DELAY = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const MAX_CONCURRENT = 3;

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
        const waitTime = RETRY_DELAY * (i + 1);
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
 * 识别图片中的饰品数量（优化版：分区域计数法）
 */
export async function countProductsInImage(imageBase64: string): Promise<number> {
  if (!OPENAI_API_KEY) {
    throw new Error("未配置 OpenAI API 密钥");
  }

  console.log("[AI Vision] countProductsInImage called with model:", VISION_MODEL);
  console.log("[AI Vision] Image base64 length:", imageBase64?.length || 0);

  return callWithRetry(async () => {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are an expert inventory counter. Count the jewelry product packages in this image.

Each package is a clear plastic bag containing a white/cream display card with jewelry attached.

**COUNTING METHOD - Use Grid Division:**
1. Mentally divide the image into a 3×3 grid (9 sections)
2. Count packages in each section:
   - Top row: Left, Center, Right
   - Middle row: Left, Center, Right  
   - Bottom row: Left, Center, Right
3. Sum all sections for the total

**IDENTIFICATION RULES:**
- Each WHITE DISPLAY CARD = 1 package (this is the key identifier)
- Cards are approximately 3cm × 5cm with "Fashion Jewelry" text
- Ignore reflections, shadows, and price tags
- If a package spans two sections, count it in the section where its CENTER is located
- Only count clearly visible, complete packages

**RESPONSE FORMAT:**
First, list the count per grid section:
Top-Left: X, Top-Center: X, Top-Right: X
Mid-Left: X, Mid-Center: X, Mid-Right: X
Bot-Left: X, Bot-Center: X, Bot-Right: X

Then provide the final total as a single number on the last line.

Example response:
Top-Left: 2, Top-Center: 1, Top-Right: 2
Mid-Left: 1, Mid-Center: 0, Mid-Right: 1
Bot-Left: 2, Bot-Center: 1, Bot-Right: 1
11`,
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
        max_tokens: 300,
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
    
    // 提取最后一行的数字作为总数
    const lines = content.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const match = lastLine.match(/\d+/);
    const count = match ? parseInt(match[0], 10) : 0;
    console.log("[AI Vision] Parsed count:", count);
    
    return count;
  });
}

/**
 * 对比两张图片的相似度（优化版：使用 GPT-4o）
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
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a jewelry product expert. Compare these two product images and determine if they are the SAME product design.

**COMPARISON CRITERIA:**
1. Overall shape and silhouette
2. Main decorative elements (pendants, charms, beads)
3. Metal type and color (gold, silver, bronze)
4. Pattern and texture details
5. Size and proportions

**SCORING GUIDE:**
- 95-100%: Identical product, same design
- 85-94%: Same design, different angle/lighting/color variant
- 70-84%: Similar style but different design
- Below 70%: Different products

**IMPORTANT:**
- Focus on the JEWELRY ITEM, not the packaging or background
- Same design with different photo angles should score 90+
- Same design in different colors should score 85+

Return JSON format only:
{
  "similarityScore": <number 0-100>,
  "analysisNote": "<brief comparison in Chinese, max 30 chars>"
}`,
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
        max_tokens: 150,
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
        model: VISION_MODEL,
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
 * 批量对比图片相似度（优化版：使用 GPT-4o + 并行处理）
 */
export async function batchCompareImages(
  newImageBase64: string,
  existingImages: Array<{ id: string; base64: string }>,
  threshold: number = 70
): Promise<Array<{ id: string; similarityScore: number; analysisNote: string }>> {
  console.log(`[AI Vision] Starting batch compare with ${existingImages.length} images, threshold: ${threshold}, model: ${VISION_MODEL}`);
  
  const imagesToCompare = existingImages;
  console.log(`[AI Vision] Will compare ${imagesToCompare.length} images`);

  const results: Array<{ id: string; similarityScore: number; analysisNote: string }> = [];

  // 使用有限并行处理
  for (let i = 0; i < imagesToCompare.length; i += MAX_CONCURRENT) {
    const batch = imagesToCompare.slice(i, i + MAX_CONCURRENT);
    console.log(`[AI Vision] Processing batch ${Math.floor(i / MAX_CONCURRENT) + 1}, images ${i + 1}-${i + batch.length}`);
    
    const batchPromises = batch.map(async (existingImage) => {
      try {
        console.log(`[AI Vision] Comparing with image ${existingImage.id}...`);
        
        const comparison = await compareImageSimilarity(newImageBase64, existingImage.base64);
        
        if (comparison.similarityScore >= threshold) {
          console.log(`[AI Vision] Found similar image ${existingImage.id}: ${comparison.similarityScore}%`);
          return {
            id: existingImage.id,
            similarityScore: comparison.similarityScore,
            analysisNote: comparison.analysisNote,
          };
        } else {
          console.log(`[AI Vision] Image ${existingImage.id} similarity: ${comparison.similarityScore}% (below threshold)`);
          return null;
        }
      } catch (error) {
        console.error(`[AI Vision] Failed to compare with image ${existingImage.id}:`, error);
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    for (const result of batchResults) {
      if (result) {
        results.push(result);
      }
    }
    
    if (i + MAX_CONCURRENT < imagesToCompare.length) {
      await delay(RATE_LIMIT_DELAY);
    }
  }

  results.sort((a, b) => b.similarityScore - a.similarityScore);
  
  console.log(`[AI Vision] Batch compare completed: ${results.length} similar images found`);
  return results;
}
