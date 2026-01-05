/**
 * AI 视觉识别服务（后端）
 * 使用 Claude API 进行图像识别
 * 优化版：使用 Claude Sonnet 4 + 分区域计数法
 */

// Claude API 配置
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// 备用 OpenAI 配置（如果 Claude 不可用）
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-4o";

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
                          error?.message?.includes('rate_limit') ||
                          error?.message?.includes('overloaded');
      
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
 * 使用 Claude API 进行图像识别
 */
async function callClaudeVision(
  imageBase64: string,
  prompt: string,
  maxTokens: number = 500
): Promise<string> {
  if (!CLAUDE_API_KEY) {
    throw new Error("未配置 Claude API 密钥");
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("Claude API error:", errorData);
    throw new Error(`Claude API request failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.content[0]?.text || "";
}

/**
 * 使用 Claude API 对比两张图片
 */
async function callClaudeVisionCompare(
  imageBase64_1: string,
  imageBase64_2: string,
  prompt: string,
  maxTokens: number = 300
): Promise<string> {
  if (!CLAUDE_API_KEY) {
    throw new Error("未配置 Claude API 密钥");
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64_1,
              },
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64_2,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("Claude API error:", errorData);
    throw new Error(`Claude API request failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.content[0]?.text || "";
}

/**
 * 识别图片中的饰品数量（使用 Claude + 分区域计数法）
 */
export async function countProductsInImage(imageBase64: string): Promise<number> {
  console.log("[AI Vision] countProductsInImage called with Claude model:", CLAUDE_MODEL);
  console.log("[AI Vision] Image base64 length:", imageBase64?.length || 0);

  const prompt = `You are an expert inventory counter. Count the jewelry product packages in this image.

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
- When uncertain, do NOT count (prefer undercounting over overcounting)

**RESPONSE FORMAT:**
First, list the count per grid section:
Top-Left: X, Top-Center: X, Top-Right: X
Mid-Left: X, Mid-Center: X, Mid-Right: X
Bot-Left: X, Bot-Center: X, Bot-Right: X

Then provide the final total as a single number on the last line.`;

  return callWithRetry(async () => {
    const content = await callClaudeVision(imageBase64, prompt, 500);
    console.log("[AI Vision] Claude response content:", content);
    
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
 * 对比两张图片的相似度（使用 Claude）
 * 优化版：支持同款不同色识别，提供详细判断理由
 */
export async function compareImageSimilarity(
  imageBase64_1: string,
  imageBase64_2: string
): Promise<{ similarityScore: number; analysisNote: string }> {
  const prompt = `你是一位专业的饰品鉴定专家。请对比这两张产品图片，判断它们是否是同一款产品。

**对比重点（按优先级）：**
1. 整体形状和轮廓（最重要）
2. 主要装饰元素（吐坠、吃块、珠子的形状和排列）
3. 图案和纹理细节
4. 尺寸和比例
5. 金属类型和颜色（注意：同款可能有不同颜色）

**评分标准：**
- 95-100%: 完全相同的产品
- 90-94%: 同款产品，不同角度/灯光
- 85-89%: 同款不同色（形状相同，颜色不同）
- 75-84%: 相似款式，但设计细节有差异
- 50-74%: 同类产品，不同设计
- 50%以下: 不同产品

**特别注意：**
- 只关注饰品本身，忽略包装、背景、展示卡
- 同款产品可能有不同颜色版本（如金色/银色/古铜色），形状相同应评 85+
- 灯光和拍摄角度可能导致颜色看起来不同
- 形状完全相同但颜色明显不同，应评 85-89%

**返回格式（严格遵守）：**
SCORE: [数字 0-100]
NOTE: [中文简要说明，包含判断理由，最多40字]

示例返回：
SCORE: 87
NOTE: 形状相同的南瓜耳环，一个银色一个古铜色，可能是同款不同色`;

  return callWithRetry(async () => {
    const content = await callClaudeVisionCompare(imageBase64_1, imageBase64_2, prompt, 200);
    console.log("[AI Vision] Claude compare response:", content);
    
    // 解析响应
    const scoreMatch = content.match(/SCORE:\s*(\d+)/i);
    const noteMatch = content.match(/NOTE:\s*(.+)/i);
    
    return {
      similarityScore: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
      analysisNote: noteMatch ? noteMatch[1].trim().substring(0, 50) : "无法分析",
    };
  });
}

/**
 * 从图片中识别条形码（使用 Claude）
 */
export async function scanBarcodeFromImage(imageBase64: string): Promise<{ barcodeValue: string | null; confidence: number }> {
  const prompt = `请仔细观察这张图片，识别其中的条形码或二维码。

识别要点：
1. 查找图片中的条形码（Code 128 格式）或二维码
2. 读取条形码下方的文字内容（通常是 SKU 编号）
3. SKU 格式可能是：
   - 系统 SKU：BL + 6位日期 + 4位字符 + 1位校验位（如 BL260103EKBAM）
   - 用户 SKU：如 LB-ER-ME-0006
   - Box ID：如 LB-RF-GM-Box-1

请返回以下格式：
BARCODE: [识别到的条形码内容，如果未识别到则写 null]
CONFIDENCE: [0-100 的整数，表示识别置信度]

注意：
- 优先读取条形码下方的文字
- 如果图片中没有条形码，返回 BARCODE: null`;

  return callWithRetry(async () => {
    const content = await callClaudeVision(imageBase64, prompt, 150);
    console.log("[AI Vision] Claude barcode response:", content);
    
    // 解析响应
    const barcodeMatch = content.match(/BARCODE:\s*(.+)/i);
    const confidenceMatch = content.match(/CONFIDENCE:\s*(\d+)/i);
    
    let barcodeValue = barcodeMatch ? barcodeMatch[1].trim() : null;
    if (barcodeValue === 'null' || barcodeValue === 'NULL') {
      barcodeValue = null;
    }
    
    return {
      barcodeValue: barcodeValue,
      confidence: confidenceMatch ? parseInt(confidenceMatch[1], 10) : 0,
    };
  });
}

/**
 * 批量对比图片相似度（使用 Claude + 并行处理）
 */
export async function batchCompareImages(
  newImageBase64: string,
  existingImages: Array<{ id: string; base64: string }>,
  threshold: number = 70
): Promise<Array<{ id: string; similarityScore: number; analysisNote: string }>> {
  console.log(`[AI Vision] Starting batch compare with ${existingImages.length} images, threshold: ${threshold}, model: ${CLAUDE_MODEL}`);
  
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
