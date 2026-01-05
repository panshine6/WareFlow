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
 * 识别图片中的饰品数量（使用 Claude + 两步计数法）
 * 优化版：先识别产品类型，再进行针对性计数
 */
export async function countProductsInImage(imageBase64: string): Promise<number> {
  console.log("[AI Vision] countProductsInImage called with Claude model:", CLAUDE_MODEL);
  console.log("[AI Vision] Image base64 length:", imageBase64?.length || 0);

  const prompt = `你是一位专业的库存清点专家。请仔细数这张图片中的饰品包装袋数量。

**重要：每个透明塑料包装袋 = 1个单位**
- 每个包装袋里有一张白色/米色展示卡，上面挂着饰品（通常是一对耳环）
- 展示卡上可能印有 "Fashion Jewelry" 字样
- 不要数饰品本身的数量，只数包装袋的数量

**计数方法 - 两步验证法：**

第一步：从左到右、从上到下扩描，标记每个包装袋的位置
- 第1行：列出从左到右的包装袋
- 第2行：列出从左到右的包装袋
- 以此类推...

第二步：汇总每行的数量，得出总数

**识别要点：**
- 关键标识：白色/米色展示卡（每张卡 = 1个包装袋）
- 忽略：反光、阴影、价格标签、背景
- 如果包装袋重叠，根据展示卡的数量来判断
- 只数清晰可见的包装袋，不确定的不要数

**输出格式（严格遵守）：**
第1行: [X个包装袋]
第2行: [X个包装袋]
...
总计: [X]

最后一行必须是纯数字，例如：11`;

  return callWithRetry(async () => {
    const content = await callClaudeVision(imageBase64, prompt, 600);
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
  const prompt = `你是一位专业的饰品鉴定专家。请对比这两张产品图片，判断它们是否是同一款饰品。

**重要：只对比饰品主体，忽略以下干扰因素：**
- 透明塑料袋及其反光、折痕
- 展示卡（白色/米色卡片）
- 品牌标签（如"Fashion Jewelry"）
- 价格标签、条形码
- 背景、桌面、灯光反射
- 塑料薄膜的反光和折射差异
这些包装差异不应影响相似度评分！

**对比重点（按优先级）：**
1. 饰品的整体形状和轮廓（最重要）
2. 主要装饰元素（吐坠、吃块、珠子的形状和排列）
3. 图案和纹理细节
4. 尺寸和比例
5. 金属类型和颜色（注意：同款可能有不同颜色）

**评分标准：**
- 95-100%: 完全相同的饰品
- 90-94%: 同款饰品，不同角度/灯光
- 85-89%: 同款不同色（形状相同，颜色不同）
- 75-84%: 相似款式，但设计细节有差异
- 50-74%: 同类饰品，不同设计
- 50%以下: 不同饰品

**特别注意：**
- 同款饰品可能有不同颜色版本（如金色/银色/古铜色），形状相同应评 85+
- 灯光和拍摄角度可能导致颜色看起来不同
- 形状完全相同但颜色明显不同，应评 85-89%
- 包装不同但饰品相同，应评 90+

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
