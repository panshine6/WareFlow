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
  const TEXT_HEIGHT = 18;  // 底部文字区域高度
  
  // 1. 生成条形码（直接绘制，不缩放，避免锯齿）
  // 计算可用的条形码区域
  const barcodeAreaHeight = LABEL_HEIGHT - TEXT_HEIGHT - MARGIN * 2;
  
  // 直接生成条形码到主 canvas，不缩放
  const barcodeCanvas = document.createElement('canvas');
  JsBarcode(barcodeCanvas, systemSku, {
    format: 'CODE128',
    width: 1,                // 最小模块宽度 = 1像素（整数）
    height: barcodeAreaHeight,  // 直接使用目标高度
    displayValue: false,     // 不显示文字（我们单独绘制）
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
  });
  
  // 条形码水平居中（整数像素）
  const barcodeX = Math.floor((LABEL_WIDTH - barcodeCanvas.width) / 2);
  const barcodeY = MARGIN;
  
  // *** 关键：绘制前再次确保禁用平滑 ***
  ctx.imageSmoothingEnabled = false;
  
  // 绘制条形码（1:1 不缩放）
  ctx.drawImage(barcodeCanvas, barcodeX, barcodeY);
  
  // 2. 绘制底部文字：系统SKU + 用户SKU（统一字体样式）
  const textY = LABEL_HEIGHT - 2;  // 底部位置（整数）
  
  // 字体设置（放大约1.5倍，从9px到14px）
  const FONT_SIZE = 14;             // 1.5倍字体大小
  const FONT_STYLE = `${FONT_SIZE}px Arial, sans-serif`;  // 统一字体样式
  const SKU_GAP = 16;               // 两个SKU之间的间距（像素）
  
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
/**
 * 保存条形码图片（替换分享功能）
 */
export async function saveBarcodeImage(
  dataURL: string,
  sku: string
): Promise<boolean> {
  try {
    downloadBarcodeImage(dataURL, `label-${sku}.png`);
    return true;
  } catch (error) {
    console.error('保存失败:', error);
    return false;
  }
}


/**
 * WareFlow Print Agent 连接和打印功能
 */

// Print Agent 配置
const PRINT_AGENT_URL = 'ws://127.0.0.1:9100';
const PRINT_AGENT_TIMEOUT = 5000; // 5秒超时

/**
 * 检查 Print Agent 是否运行
 */
export async function checkPrintAgentStatus(): Promise<{
  connected: boolean;
  printer?: string;
  version?: string;
  message?: string;
}> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(PRINT_AGENT_URL);
      
      const timeout = setTimeout(() => {
        ws.close();
        resolve({
          connected: false,
          message: '连接超时，请确保 WareFlow Print Agent 正在运行'
        });
      }, PRINT_AGENT_TIMEOUT);
      
      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'status' }));
      };
      
      ws.onmessage = (event) => {
        clearTimeout(timeout);
        try {
          const data = JSON.parse(event.data);
          ws.close();
          resolve({
            connected: data.connected || data.niimprintx_found,
            printer: data.printer,
            version: data.version,
          });
        } catch {
          ws.close();
          resolve({
            connected: false,
            message: '无效的响应数据'
          });
        }
      };
      
      ws.onerror = () => {
        clearTimeout(timeout);
        resolve({
          connected: false,
          message: '无法连接到 WareFlow Print Agent，请确保已启动'
        });
      };
      
      ws.onclose = () => {
        clearTimeout(timeout);
      };
      
    } catch (error) {
      resolve({
        connected: false,
        message: `连接错误: ${error}`
      });
    }
  });
}

/**
 * 通过 Print Agent 打印标签
 */
export async function printLabelViaPrintAgent(
  imageDataURL: string,
  options?: {
    model?: string;
    density?: number;
    quantity?: number;
    rotate?: number;
  }
): Promise<{
  success: boolean;
  message: string;
}> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(PRINT_AGENT_URL);
      
      const timeout = setTimeout(() => {
        ws.close();
        resolve({
          success: false,
          message: '打印超时，请检查打印机连接'
        });
      }, 60000); // 打印超时 60 秒
      
      ws.onopen = () => {
        const printRequest = {
          action: 'print',
          data: {
            image: imageDataURL,
            model: options?.model || 'd110',
            density: options?.density || 3,
            quantity: options?.quantity || 1,
            rotate: options?.rotate || 0,
          }
        };
        ws.send(JSON.stringify(printRequest));
      };
      
      ws.onmessage = (event) => {
        clearTimeout(timeout);
        try {
          const data = JSON.parse(event.data);
          ws.close();
          resolve({
            success: data.success,
            message: data.message || (data.success ? '打印成功' : '打印失败')
          });
        } catch {
          ws.close();
          resolve({
            success: false,
            message: '无效的响应数据'
          });
        }
      };
      
      ws.onerror = () => {
        clearTimeout(timeout);
        resolve({
          success: false,
          message: '无法连接到 WareFlow Print Agent，请确保已启动'
        });
      };
      
      ws.onclose = () => {
        clearTimeout(timeout);
      };
      
    } catch (error) {
      resolve({
        success: false,
        message: `连接错误: ${error}`
      });
    }
  });
}
