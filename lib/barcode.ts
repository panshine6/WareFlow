/**
 * SKU 生成和条形码工具库
 * 适配 Niimbot D110 (38mm × 12mm 标签，横向)
 * 
 * 标签布局（横向）：
 * ┌─────────────────────────────────────────────┐  ↑
 * │      |||||||||||||||||||||||||||||||        │  
 * │          条形码 (Code 128)                   │  12mm
 * │      系统SKU       用户SKU(加粗加大)          │  ↓
 * └─────────────────────────────────────────────┘
 *                    ← 38mm →
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
 * 生成适合 Niimbot D110 的标签图片（高清版本）
 * 标签尺寸: 38mm（宽）× 12mm（高）- 横向布局
 * 打印精度: 208dpi
 * 
 * 使用 2x 分辨率生成高清图片，解决打印模糊问题
 * 
 * 像素计算 (2x 高清):
 * - 38mm @ 208dpi × 2 = 622px (宽度)
 * - 12mm @ 208dpi × 2 = 196px (高度)
 * 
 * 布局：
 * - 上方：条形码（Code 128）
 * - 下方：系统SKU（小字）+ 用户SKU（加粗加大20%）
 */
export async function generateLabelForNiimbotD110(
  systemSku: string,
  userSku?: string
): Promise<string> {
  const JsBarcode = (await import('jsbarcode')).default;
  
  // 2x 高清分辨率系数
  const SCALE = 2;
  
  // 标签尺寸（像素 @ 208dpi × 2）- 横向高清
  const LABEL_WIDTH = 311 * SCALE;   // 38mm @ 208dpi = 311px, × 2 = 622px
  const LABEL_HEIGHT = 98 * SCALE;   // 12mm @ 208dpi = 98px, × 2 = 196px
  
  // 创建主 canvas
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  
  // 白色背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
  
  // 设置文字样式
  ctx.fillStyle = '#000000';
  
  // 边距（按比例放大）
  const MARGIN = 8 * SCALE;
  const TEXT_HEIGHT = 16 * SCALE;  // 底部文字区域高度
  
  // 1. 生成条形码（高分辨率）
  const barcodeCanvas = document.createElement('canvas');
  JsBarcode(barcodeCanvas, systemSku, {
    format: 'CODE128',
    width: 3,                // 条形码线条宽度（放大）
    height: 120,             // 条形码高度（放大）
    displayValue: false,     // 不显示文字（我们单独绘制）
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
  });
  
  // 计算条形码区域
  const barcodeAreaWidth = LABEL_WIDTH - MARGIN * 2;
  const barcodeAreaHeight = LABEL_HEIGHT - TEXT_HEIGHT - MARGIN;
  
  // 缩放条形码以适应可用空间
  const barcodeScale = Math.min(
    barcodeAreaWidth / barcodeCanvas.width,
    barcodeAreaHeight / barcodeCanvas.height
  );
  
  const scaledBarcodeWidth = barcodeCanvas.width * barcodeScale;
  const scaledBarcodeHeight = barcodeCanvas.height * barcodeScale;
  
  // 条形码水平居中
  const barcodeX = (LABEL_WIDTH - scaledBarcodeWidth) / 2;
  const barcodeY = MARGIN;
  
  // 绘制条形码
  ctx.drawImage(
    barcodeCanvas,
    barcodeX,
    barcodeY,
    scaledBarcodeWidth,
    scaledBarcodeHeight
  );
  
  // 2. 绘制底部文字：系统SKU + 用户SKU（分开绘制，不同样式）
  const textY = LABEL_HEIGHT - 6 * SCALE;  // 底部位置
  
  // 字体大小设置（按比例放大）
  const systemSkuFontSize = 9 * SCALE;      // 系统SKU字体大小
  const userSkuFontSize = 11 * SCALE;       // 用户SKU字体大小（加大约20%）
  const SKU_GAP = 15 * SCALE;               // 两个SKU之间的间距（像素）
  
  if (userSku) {
    // 有用户SKU时，分开绘制两个SKU
    
    // 先计算两个文字的宽度
    ctx.font = `${systemSkuFontSize}px Arial, sans-serif`;
    const systemSkuWidth = ctx.measureText(systemSku).width;
    
    ctx.font = `bold ${userSkuFontSize}px Arial, sans-serif`;
    const userSkuWidth = ctx.measureText(userSku).width;
    
    // 计算总宽度和起始位置（居中）
    const totalWidth = systemSkuWidth + SKU_GAP + userSkuWidth;
    const startX = (LABEL_WIDTH - totalWidth) / 2;
    
    // 绘制系统SKU（普通字体，较小）
    ctx.font = `${systemSkuFontSize}px Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(systemSku, startX, textY);
    
    // 绘制用户SKU（加粗加大）
    ctx.font = `bold ${userSkuFontSize}px Arial, sans-serif`;
    ctx.fillText(userSku, startX + systemSkuWidth + SKU_GAP, textY);
    
  } else {
    // 只有系统SKU时，居中显示
    ctx.font = `bold ${systemSkuFontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(systemSku, LABEL_WIDTH / 2, textY);
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
