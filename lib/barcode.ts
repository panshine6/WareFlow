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
 * 格式: LB + YYMMDD + 4位随机数 + 校验位
 * 示例: LB241229A7K3X
 */
export function generateSystemSKU(): string {
  const prefix = 'LB';
  
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
 * 生成适合 Niimbot D110 的标签图片（双条形码版本）
 * 
 * 新布局：
 * ┌─────────────────────────────────────────────┐
 * │      |||||||||||||||||||||||||||||||        │  系统SKU条形码
 * │              BL260101EKBAM                  │  系统SKU文字
 * │      |||||||||||||||||||||||||||||||        │  内部SKU条形码
 * │              LB-ER-ME-0006                  │  内部SKU文字
 * └─────────────────────────────────────────────┘
 * 
 * 打印机规格:
 * - Niimbot D110: 203 DPI
 * - 40mm × 30mm 标签 = 320px × 240px
 */
export async function generateLabelForNiimbotD110(
  systemSku: string,
  userSku?: string
): Promise<string> {
  const JsBarcode = (await import('jsbarcode')).default;
  
  // 标签尺寸 @ 203 DPI (1mm ≈ 8px)
  // 使用 40mm × 30mm 标签以容纳两个条形码
  const LABEL_WIDTH = 320;   // 40mm × 8 = 320px
  const LABEL_HEIGHT = 240;  // 30mm × 8 = 240px
  
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
  
  // 布局参数
  const MARGIN = 8;
  const BARCODE_HEIGHT = 60;  // 每个条形码高度
  const TEXT_HEIGHT = 20;     // 每个文字高度
  const GAP = 8;              // 条形码和文字之间的间距
  
  // 字体设置
  const FONT_SIZE = 16;
  const FONT_STYLE = `bold ${FONT_SIZE}px Arial, sans-serif`;
  
  // === 第一个条形码：系统SKU ===
  const barcode1Canvas = document.createElement('canvas');
  JsBarcode(barcode1Canvas, systemSku, {
    format: 'CODE128',
    width: 1.5,
    height: BARCODE_HEIGHT,
    displayValue: false,
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
  });
  
  // 第一个条形码位置（居中）
  const barcode1X = Math.floor((LABEL_WIDTH - barcode1Canvas.width) / 2);
  const barcode1Y = MARGIN;
  
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(barcode1Canvas, barcode1X, barcode1Y);
  
  // 第一个条形码下方的文字
  const text1Y = barcode1Y + BARCODE_HEIGHT + TEXT_HEIGHT - 2;
  ctx.font = FONT_STYLE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(systemSku, Math.floor(LABEL_WIDTH / 2), text1Y);
  
  // === 第二个条形码：内部SKU ===
  // 如果有内部SKU，显示内部SKU；否则显示系统SKU
  const secondSku = userSku || systemSku;
  
  const barcode2Canvas = document.createElement('canvas');
  JsBarcode(barcode2Canvas, secondSku, {
    format: 'CODE128',
    width: 1.5,
    height: BARCODE_HEIGHT,
    displayValue: false,
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
  });
  
  // 第二个条形码位置（居中）
  const barcode2X = Math.floor((LABEL_WIDTH - barcode2Canvas.width) / 2);
  const barcode2Y = text1Y + GAP;
  
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(barcode2Canvas, barcode2X, barcode2Y);
  
  // 第二个条形码下方的文字
  const text2Y = barcode2Y + BARCODE_HEIGHT + TEXT_HEIGHT - 2;
  ctx.fillText(secondSku, Math.floor(LABEL_WIDTH / 2), text2Y);
  
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
 * 在 PNG 图片中嵌入 DPI 元数据 (pHYs chunk)
 * 
 * PNG 文件通过 pHYs chunk 存储像素密度信息。
 * 这让 Niimbot 软件能正确识别图片的物理尺寸，自动填满标签纸。
 * 
 * pHYs chunk 格式 (25 bytes):
 * - Length (4 bytes): 00 00 00 09
 * - Type (4 bytes): "pHYs" (70 48 59 73)
 * - Data (9 bytes):
 *   - X pixels per unit (4 bytes, big-endian)
 *   - Y pixels per unit (4 bytes, big-endian)
 *   - Unit specifier (1 byte): 1 = meter
 * - CRC32 (4 bytes)
 */
function addDpiToPng(dataURL: string, dpi: number): string {
  // 解码 base64 数据
  const base64Data = dataURL.split(',')[1];
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // PNG signature (8 bytes) + IHDR chunk (25 bytes) = 33 bytes
  // pHYs chunk 应该插入在 IHDR 之后
  const PNG_SIGNATURE_LENGTH = 8;
  const IHDR_CHUNK_LENGTH = 25; // 4 (length) + 4 (type) + 13 (data) + 4 (crc)
  const INSERT_POSITION = PNG_SIGNATURE_LENGTH + IHDR_CHUNK_LENGTH;
  
  // 创建 pHYs chunk
  const phys = createPhysChunk(dpi);
  
  // 检查是否已经有 pHYs chunk（避免重复添加）
  const existingPhysIndex = findChunk(bytes, 'pHYs');
  
  let newBytes: Uint8Array;
  
  if (existingPhysIndex !== -1) {
    // 已有 pHYs chunk，替换它
    const before = bytes.slice(0, existingPhysIndex);
    const after = bytes.slice(existingPhysIndex + 25); // pHYs chunk 固定 25 字节
    newBytes = new Uint8Array(before.length + phys.length + after.length);
    newBytes.set(before, 0);
    newBytes.set(phys, before.length);
    newBytes.set(after, before.length + phys.length);
  } else {
    // 没有 pHYs chunk，插入新的
    const before = bytes.slice(0, INSERT_POSITION);
    const after = bytes.slice(INSERT_POSITION);
    newBytes = new Uint8Array(before.length + phys.length + after.length);
    newBytes.set(before, 0);
    newBytes.set(phys, before.length);
    newBytes.set(after, before.length + phys.length);
  }
  
  // 编码回 base64
  let binary = '';
  for (let i = 0; i < newBytes.length; i++) {
    binary += String.fromCharCode(newBytes[i]);
  }
  return 'data:image/png;base64,' + btoa(binary);
}

/**
 * 创建 pHYs chunk
 */
function createPhysChunk(dpi: number): Uint8Array {
  // DPI 转换为每米像素数
  const INCHES_PER_METER = 39.3701;
  const pixelsPerMeter = Math.round(dpi * INCHES_PER_METER);
  
  // pHYs chunk 数据 (9 bytes)
  const data = new Uint8Array(9);
  // X pixels per meter (big-endian)
  data[0] = (pixelsPerMeter >> 24) & 0xFF;
  data[1] = (pixelsPerMeter >> 16) & 0xFF;
  data[2] = (pixelsPerMeter >> 8) & 0xFF;
  data[3] = pixelsPerMeter & 0xFF;
  // Y pixels per meter (big-endian)
  data[4] = (pixelsPerMeter >> 24) & 0xFF;
  data[5] = (pixelsPerMeter >> 16) & 0xFF;
  data[6] = (pixelsPerMeter >> 8) & 0xFF;
  data[7] = pixelsPerMeter & 0xFF;
  // Unit specifier: 1 = meter
  data[8] = 1;
  
  // Type field: "pHYs"
  const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]); // "pHYs" in ASCII
  
  // 计算 CRC32 (type + data)
  const typeAndData = new Uint8Array(type.length + data.length);
  typeAndData.set(type, 0);
  typeAndData.set(data, type.length);
  const crc = crc32(typeAndData);
  
  // 组装完整的 chunk (25 bytes)
  const chunk = new Uint8Array(25);
  // Length field: 9 (big-endian)
  chunk[0] = 0x00;
  chunk[1] = 0x00;
  chunk[2] = 0x00;
  chunk[3] = 0x09;
  // Type field
  chunk.set(type, 4);
  // Data field
  chunk.set(data, 8);
  // CRC32 field (big-endian)
  chunk[17] = (crc >> 24) & 0xFF;
  chunk[18] = (crc >> 16) & 0xFF;
  chunk[19] = (crc >> 8) & 0xFF;
  chunk[20] = crc & 0xFF;
  
  return chunk;
}

/**
 * 在 PNG 数据中查找指定类型的 chunk
 */
function findChunk(bytes: Uint8Array, chunkType: string): number {
  const typeBytes = new TextEncoder().encode(chunkType);
  let pos = 8; // 跳过 PNG signature
  
  while (pos < bytes.length - 12) {
    // 检查 type field
    if (bytes[pos + 4] === typeBytes[0] &&
        bytes[pos + 5] === typeBytes[1] &&
        bytes[pos + 6] === typeBytes[2] &&
        bytes[pos + 7] === typeBytes[3]) {
      return pos;
    }
    // 移动到下一个 chunk
    const length = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
    pos += 12 + length; // 4 (length) + 4 (type) + length (data) + 4 (crc)
  }
  
  return -1;
}

/**
 * CRC32 计算 (PNG 标准)
 */
function crc32(data: Uint8Array): number {
  // CRC32 查找表
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
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
 * 下载条形码图片到文件（电脑或手机文件）
 */
export async function saveBarcodeImage(
  dataURL: string,
  sku: string
): Promise<boolean> {
  try {
    downloadBarcodeImage(dataURL, `label-${sku}.png`);
    return true;
  } catch (error) {
    console.error('下载失败:', error);
    return false;
  }
}

/**
 * 保存条形码图片到相册（手机 Photo）
 * 使用 Web Share API 的文件分享功能，在 iOS 上可以选择保存到相册
 */
export async function saveToPhotoAlbum(
  dataURL: string,
  sku: string
): Promise<boolean> {
  try {
    // 将 dataURL 转换为 Blob
    const response = await fetch(dataURL);
    const blob = await response.blob();
    
    // 创建 File 对象
    const file = new File([blob], `label-${sku}.png`, { type: 'image/png' });
    
    // 检查是否支持 Web Share API 的文件分享
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `标签-${sku}`,
      });
      return true;
    } else {
      // 不支持文件分享，回退到下载
      console.log('不支持文件分享，回退到下载');
      downloadBarcodeImage(dataURL, `label-${sku}.png`);
      return true;
    }
  } catch (error) {
    // 用户取消分享不算错误
    if (error instanceof Error && error.name === 'AbortError') {
      return true;
    }
    console.error('保存到相册失败:', error);
    // 失败时回退到下载
    downloadBarcodeImage(dataURL, `label-${sku}.png`);
    return true;
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
