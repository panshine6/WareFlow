/**
 * SKU 生成和条形码工具库
 * 适配 Brother PT-P300BT (12mm 标签宽度)
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
 * 适配 12mm 标签宽度
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
  
  // 默认配置适配 12mm 标签
  // 12mm ≈ 45px @96dpi, 但我们用更高分辨率以便打印
  const defaultOptions = {
    format: 'CODE128',
    width: 1.5,           // 条形码线条宽度
    height: 40,           // 条形码高度（像素）
    displayValue: true,   // 显示 SKU 文字
    fontSize: 12,         // 字体大小
    textMargin: 2,        // 文字与条形码间距
    margin: 5,            // 边距
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
 * 生成适合 PT-P300BT 的标签图片
 * 12mm 宽度，只包含条形码和 SKU
 */
export async function generateLabelForPTP300BT(sku: string): Promise<string> {
  const JsBarcode = (await import('jsbarcode')).default;
  
  // 创建 canvas
  // 12mm ≈ 45px @96dpi，但打印需要更高分辨率
  // 使用 180dpi (PT-P300BT 分辨率)，12mm ≈ 85px
  const canvas = document.createElement('canvas');
  
  // 先生成条形码获取尺寸
  JsBarcode(canvas, sku, {
    format: 'CODE128',
    width: 1.2,           // 较窄的条形码线条
    height: 50,           // 条形码高度
    displayValue: true,   // 显示 SKU 文字
    fontSize: 14,         // 字体大小
    textMargin: 3,        // 文字与条形码间距
    margin: 8,            // 边距
    background: '#ffffff',
    lineColor: '#000000',
    font: 'monospace',
    textAlign: 'center',
  });
  
  return canvas.toDataURL('image/png');
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
