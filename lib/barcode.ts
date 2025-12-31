/**
 * SKU 生成和条形码工具库
 * 适配 Niimbot D110 (38mm × 12mm 标签，横向)
 * 
 * 打印机规格:
 * - 分辨率: 203 DPI
 * - 1mm ≈ 8 像素 (203/25.4)
 * 
 * 标签布局（横向）：
 * ┌─────────────────────────────────────────────┐  ↑
 * │      |||||||||||||||||||||||||||||||        │  
 * │          条形码 (Code 128)                   │  12mm (96px)
 * │      系统SKU       用户SKU(加粗加大)          │  ↓
 * └─────────────────────────────────────────────┘
 *                    ← 38mm (304px) →
 */

// Luhn Mod 36 校验位计算
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function charToValue(char: string): number {
  return CHARSET.indexOf(char.toUpperCase());
}

function valueToChar(value: number): string {
  return CHARSET[value % 36];
}

/**
 * 计算 Luhn Mod 36 校验位
 */
function calculateLuhnMod36CheckDigit(input: string): string {
  let sum = 0;
  let factor = 2;
  
  // 从右到左处理每个字符
  for (let i = input.length - 1; i >= 0; i--) {
    let addend = charToValue(input[i]) * factor;
    
    // 如果乘积 >= 36，则将各位数字相加
    addend = Math.floor(addend / 36) + (addend % 36);
    sum += addend;
    
    // 交替因子 1 和 2
    factor = factor === 2 ? 1 : 2;
  }
  
  const remainder = sum % 36;
  const checkDigit = (36 - remainder) % 36;
  
  return valueToChar(checkDigit);
}

/**
 * 验证 SKU 的校验位是否正确
 */
export function validateSKU(sku: string): boolean {
  if (!sku || sku.length < 3) return false;
  
  const body = sku.slice(0, -1);
  const checkDigit = sku.slice(-1);
  
  return calculateLuhnMod36CheckDigit(body) === checkDigit.toUpperCase();
}

/**
 * 生成系统 SKU
 * 格式: BL + YYMMDD + 4位随机数 + 校验位
 * 示例: BL241229A7K3X
 */
export function generateSystemSKU(): string {
  const prefix = 'BL';
  
  // 获取当前日期 YYMMDD
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  
  // 生成 4 位 Base36 随机数
  const randomPart = Array.from({ length: 4 }, () => 
    CHARSET[Math.floor(Math.random() * 36)]
  ).join('');
  
  // 组合 SKU 主体
  const skuBody = `${prefix}${dateStr}${randomPart}`;
  
  // 计算校验位
  const checkDigit = calculateLuhnMod36CheckDigit(skuBody);
  
  return `${skuBody}${checkDigit}`;
}

/**
 * 生成条形码 Canvas
 * 基础条形码生成
 */
export async function generateBarcodeCanvas(
  sku: string,
  options?: {
    width?: number;
    height?: number;
    displayValue?: boolean;
    fontSize?: number;
  }
): Promise<HTMLCanvasElement> {
  // 动态导入 JsBarcode（仅在浏览器环境）
  const JsBarcode = (await import('jsbarcode')).default;
  
  const canvas = document.createElement('canvas');
  
  // 默认配置
  const defaultOptions = {
    format: 'CODE128',
    width: 1.5,
    height: 40,
    displayValue: true,
    fontSize: 12,
    textMargin: 2,
    margin: 5,
    background: '#ffffff',
    lineColor: '#000000',
  };
  
  JsBarcode(canvas, sku, {
    ...defaultOptions,
    ...options,
  });
  
  return canvas;
}

/**
 * 生成条形码 Data URL (PNG)
 */
export async function generateBarcodeDataURL(
  sku: string,
  options?: {
    width?: number;
    height?: number;
    displayValue?: boolean;
    fontSize?: number;
  }
): Promise<string> {
  const canvas = await generateBarcodeCanvas(sku, options);
  return canvas.toDataURL('image/png');
}

/**
 * 生成适合 Niimbot D110 的标签图片（像素精确版本）
 * 
 * 关键优化：
 * 1. 禁用抗锯齿 (imageSmoothingEnabled = false)
 * 2. 所有坐标和尺寸使用整数像素
 * 3. 条形码线条宽度使用整数像素
 * 4. 图片尺寸精确匹配打印机物理像素 (1:1)
 * 
 * 打印机规格:
 * - Niimbot D110: 203 DPI
 * - 38mm × 12mm = 304px × 96px (精确计算: 38 × 8 = 304, 12 × 8 = 96)
 */
export async function generateLabelForNiimbotD110(
  systemSku: string,
  userSku?: string
): Promise<string> {
  const JsBarcode = (await import('jsbarcode')).default;
  
  // 精确像素尺寸 @ 203 DPI (1mm ≈ 8px)
  const LABEL_WIDTH = 304;   // 38mm × 8 = 304px
  const LABEL_HEIGHT = 96;   // 12mm × 8 = 96px
  
  // 创建主 canvas
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  
  // *** 关键：禁用抗锯齿，确保线条锐利 ***
  ctx.imageSmoothingEnabled = false;
  
  // 白色背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
  
  // 设置文字样式
  ctx.fillStyle = '#000000';
  
  // 边距（整数像素）
  const MARGIN = 4;
  const TEXT_HEIGHT = 14;  // 底部文字区域高度
  
  // 1. 生成条形码（使用整数像素宽度）
  const barcodeCanvas = document.createElement('canvas');
  JsBarcode(barcodeCanvas, systemSku, {
    format: 'CODE128',
    width: 1,                // 最小模块宽度 = 1像素（整数）
    height: 60,              // 条形码高度（整数）
    displayValue: false,     // 不显示文字（我们单独绘制）
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
  });
  
  // 计算条形码区域
  const barcodeAreaWidth = LABEL_WIDTH - MARGIN * 2;
  const barcodeAreaHeight = LABEL_HEIGHT - TEXT_HEIGHT - MARGIN;
  
  // 计算缩放比例（尽量使用整数缩放或接近整数）
  const scaleX = barcodeAreaWidth / barcodeCanvas.width;
  const scaleY = barcodeAreaHeight / barcodeCanvas.height;
  const barcodeScale = Math.min(scaleX, scaleY);
  
  // 使用 Math.floor 确保整数像素
  const scaledBarcodeWidth = Math.floor(barcodeCanvas.width * barcodeScale);
  const scaledBarcodeHeight = Math.floor(barcodeCanvas.height * barcodeScale);
  
  // 条形码水平居中（整数像素）
  const barcodeX = Math.floor((LABEL_WIDTH - scaledBarcodeWidth) / 2);
  const barcodeY = MARGIN;
  
  // *** 关键：绘制前再次确保禁用平滑 ***
  ctx.imageSmoothingEnabled = false;
  
  // 绘制条形码
  ctx.drawImage(
    barcodeCanvas,
    barcodeX,
    barcodeY,
    scaledBarcodeWidth,
    scaledBarcodeHeight
  );
  
  // 2. 绘制底部文字：系统SKU + 用户SKU（统一字体样式）
  const textY = LABEL_HEIGHT - 2;  // 底部位置（整数）
  
  // 字体设置（统一样式，确保清晰）
  const FONT_SIZE = 9;              // 统一字体大小
  const FONT_STYLE = `${FONT_SIZE}px Arial, sans-serif`;  // 统一字体样式
  const SKU_GAP = 12;               // 两个SKU之间的间距（像素）
  
  if (userSku) {
    // 有用户SKU时，分开绘制两个SKU
    
    // 设置统一字体
    ctx.font = FONT_STYLE;
    
    // 计算两个文字的宽度
    const systemSkuWidth = Math.ceil(ctx.measureText(systemSku).width);
    const userSkuWidth = Math.ceil(ctx.measureText(userSku).width);
    
    // 计算总宽度和起始位置（居中，整数像素）
    const totalWidth = systemSkuWidth + SKU_GAP + userSkuWidth;
    const startX = Math.floor((LABEL_WIDTH - totalWidth) / 2);
    
    // 绘制系统SKU
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(systemSku, startX, textY);
    
    // 绘制用户SKU（统一字体）
    ctx.fillText(userSku, startX + systemSkuWidth + SKU_GAP, textY);
    
  } else {
    // 只有系统SKU时，居中显示
    ctx.font = FONT_STYLE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(systemSku, Math.floor(LABEL_WIDTH / 2), textY);
  }
  
  return canvas.toDataURL('image/png');
}

/**
 * 生成适合 PT-P300BT 的标签图片（保留兼容性）
 * 使用新的 D110 格式
 */
export async function generateLabelForPTP300BT(sku: string): Promise<string> {
  return generateLabelForNiimbotD110(sku);
}

/**
 * 下载条形码图片
 */
export function downloadBarcodeImage(dataURL: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 分享条形码图片（移动端）
 */
export async function shareBarcodeImage(
  dataURL: string,
  sku: string
): Promise<boolean> {
  try {
    // 将 Data URL 转换为 Blob
    const response = await fetch(dataURL);
    const blob = await response.blob();
    
    // 创建 File 对象
    const file = new File([blob], `label-${sku}.png`, { type: 'image/png' });
    
    // 检查是否支持 Web Share API
    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `标签 - ${sku}`,
        text: `产品标签: ${sku}`,
        files: [file],
      });
      return true;
    }
    
    // 如果不支持分享，则下载
    downloadBarcodeImage(dataURL, `label-${sku}.png`);
    return true;
  } catch (error) {
    console.error('分享失败:', error);
    // 降级为下载
    downloadBarcodeImage(dataURL, `label-${sku}.png`);
    return false;
  }
}
