/**
 * SKU 生成和条形码工具库
 * 适配 Niimbot D110 (12mm × 40mm 标签)
 * 
 * 标签布局（纵向）：
 * ┌─────────────┐  ↑
 * │   用户SKU   │  │
 * │  (人工阅读)  │  │
 * │             │  │
 * │  ┃┃┃┃┃┃┃┃  │  40mm
 * │  条形码     │  │
 * │  ┃┃┃┃┃┃┃┃  │  │
 * │             │  │
 * │  系统SKU   │  │
 * └─────────────┘  ↓
 *    ← 12mm →
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
 * 生成适合 Niimbot D110 的标签图片
 * 标签尺寸: 12mm（宽）× 40mm（长）
 * 打印精度: 203dpi
 * 
 * 像素计算:
 * - 12mm @ 203dpi ≈ 96px (宽度)
 * - 40mm @ 203dpi ≈ 319px (长度/高度)
 * 
 * 布局（从上到下）:
 * 1. 用户SKU（人工阅读）
 * 2. 条形码（Code 128，旋转90度，纵向显示）
 * 3. 系统SKU
 */
export async function generateLabelForNiimbotD110(
  systemSku: string,
  userSku?: string
): Promise<string> {
  const JsBarcode = (await import('jsbarcode')).default;
  
  // 标签尺寸（像素 @ 203dpi）
  const LABEL_WIDTH = 96;   // 12mm
  const LABEL_HEIGHT = 319; // 40mm
  
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
  ctx.textAlign = 'center';
  
  // 边距
  const MARGIN = 4;
  const centerX = LABEL_WIDTH / 2;
  
  // 1. 绘制用户SKU（顶部，人工阅读）
  if (userSku) {
    ctx.font = 'bold 11px Arial, sans-serif';
    // 如果 SKU 太长，需要缩小字体或换行
    const maxWidth = LABEL_WIDTH - MARGIN * 2;
    let displaySku = userSku;
    let fontSize = 11;
    
    // 自动调整字体大小
    while (ctx.measureText(displaySku).width > maxWidth && fontSize > 6) {
      fontSize--;
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    }
    
    // 如果还是太长，截断并添加省略号
    if (ctx.measureText(displaySku).width > maxWidth) {
      while (ctx.measureText(displaySku + '...').width > maxWidth && displaySku.length > 3) {
        displaySku = displaySku.slice(0, -1);
      }
      displaySku += '...';
    }
    
    ctx.fillText(displaySku, centerX, MARGIN + 12);
  }
  
  // 2. 生成条形码（中间部分）
  // 先生成横向条形码
  const barcodeCanvas = document.createElement('canvas');
  JsBarcode(barcodeCanvas, systemSku, {
    format: 'CODE128',
    width: 1,              // 条形码线条宽度（较窄以适应小标签）
    height: 70,            // 条形码高度（旋转后变成宽度）
    displayValue: false,   // 不显示文字（我们单独绘制）
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
  });
  
  // 计算条形码区域
  const barcodeStartY = userSku ? 30 : 15;
  const barcodeEndY = LABEL_HEIGHT - 45;
  const barcodeAreaHeight = barcodeEndY - barcodeStartY;
  
  // 旋转条形码 90 度并绘制
  ctx.save();
  ctx.translate(centerX, barcodeStartY + barcodeAreaHeight / 2);
  ctx.rotate(-Math.PI / 2); // 逆时针旋转90度
  
  // 计算缩放比例，使条形码适应可用空间
  const scale = Math.min(
    barcodeAreaHeight / barcodeCanvas.width,
    (LABEL_WIDTH - MARGIN * 2) / barcodeCanvas.height
  );
  
  const scaledWidth = barcodeCanvas.width * scale;
  const scaledHeight = barcodeCanvas.height * scale;
  
  ctx.drawImage(
    barcodeCanvas,
    -scaledWidth / 2,
    -scaledHeight / 2,
    scaledWidth,
    scaledHeight
  );
  ctx.restore();
  
  // 3. 绘制系统SKU（底部）
  ctx.font = '9px monospace';
  ctx.fillText(systemSku, centerX, LABEL_HEIGHT - MARGIN - 3);
  
  return canvas.toDataURL('image/png');
}

/**
 * 生成适合 PT-P300BT 的标签图片（保留兼容性）
 * 12mm 宽度，只包含条形码和 SKU
 */
export async function generateLabelForPTP300BT(sku: string): Promise<string> {
  // 使用新的 D110 格式，不传用户SKU
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
