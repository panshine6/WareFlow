# AI 图像识别物体计数方案研究

## 技术方案选型

经过研究，针对本项目的**时尚饰品数量识别**需求，有以下几种可行方案：

### 方案一：OpenAI Vision API（推荐）

**优势**：
- 强大的视觉理解能力，可以识别物体、形状、颜色和纹理
- 支持自然语言提示词，可以直接要求"计算图片中白色标签的数量"
- 无需训练模型，开箱即用
- 支持多种图片输入方式（URL、Base64、文件 ID）
- 单次请求最多支持 500 张图片

**实现方式**：
```javascript
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{
    role: "user",
    content: [
      { 
        type: "text", 
        text: "请计算图片中带有白色标签的饰品数量。这些饰品放置在深色背景上，每个饰品都有一个约3cm×5cm的白色标签。请只返回数字。" 
      },
      {
        type: "image_url",
        image_url: { url: imageBase64OrUrl }
      }
    ]
  }]
});

const count = parseInt(response.choices[0].message.content);
```

**成本**：
- GPT-4o-mini：低成本，适合生产环境
- GPT-4o：高准确度，但成本较高

**限制**：
- 需要网络连接
- 需要 OpenAI API 密钥
- 对于密集重叠的物体可能识别不准确

### 方案二：Google Cloud Vision API

**优势**：
- 专业的物体定位（Object Localization）功能
- 可以检测和提取图片中的多个物体
- 返回每个物体的边界框坐标

**实现方式**：
```javascript
const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient();

const [result] = await client.objectLocalization(imageBuffer);
const objects = result.localizedObjectAnnotations;
const count = objects.filter(obj => obj.name === 'Product').length;
```

**限制**：
- 物体定位算法会忽略较小或不显著的物体
- 需要 Google Cloud 账户和 API 密钥
- 不支持自定义物体类别（如"带白色标签的饰品"）

### 方案三：本地 YOLO 模型（高级方案）

**优势**：
- 完全离线运行，无需网络
- 可以训练自定义模型识别特定物体
- 实时处理速度快

**实现方式**：
- 使用 TensorFlow.js 或 ONNX Runtime 在移动端运行 YOLO 模型
- 需要收集训练数据并训练模型

**限制**：
- 需要大量训练数据
- 模型文件较大（10-50MB）
- 开发和训练成本高

## 推荐方案：OpenAI Vision API + 提示词优化

### 为什么选择 OpenAI Vision API？

1. **快速上线**：无需训练模型，直接调用 API
2. **高准确度**：GPT-4o 系列模型具有强大的视觉理解能力
3. **灵活性**：可以通过提示词调整识别逻辑
4. **成本可控**：使用 gpt-4o-mini 模型成本较低

### 提示词优化策略

为了提高识别准确度，可以使用以下提示词模板：

```
请仔细观察这张图片，计算图片中时尚饰品的数量。

识别要点：
1. 每个饰品都附有一个白色标签（约3cm×5cm）
2. 饰品放置在深色背景上，便于识别
3. 请数清楚所有可见的白色标签数量
4. 如果有重叠或遮挡，请尽量估算

请只返回一个数字，表示饰品的总数量。
```

### 备选方案：用户手动确认

由于 AI 识别可能存在误差，应用设计中已包含**数量确认界面**，允许用户：
- 查看 AI 识别的数量
- 手动修改数量
- 重新拍照

这样可以确保数据准确性。

## 技术实现要点

### 1. 图片预处理

在发送给 API 之前，可以进行以下优化：
- 压缩图片大小（减少传输时间和成本）
- 调整对比度（增强白色标签的可见性）
- 裁剪无关区域

### 2. 错误处理

- 网络请求失败：提示用户重试或手动输入
- API 返回非数字：提示用户手动输入
- 识别数量为 0：提示用户检查拍照角度和光线

### 3. 成本优化

- 使用 `gpt-4o-mini` 而非 `gpt-4o`
- 设置 `detail: "low"` 参数（85 tokens 预算）
- 压缩图片至合理尺寸（512px × 512px）

## 参考资料

- OpenAI Vision API 文档：https://platform.openai.com/docs/guides/images-vision
- Google Cloud Vision API：https://cloud.google.com/vision/docs/object-localizer
- YOLO 物体计数：https://docs.ultralytics.com/guides/object-counting/
