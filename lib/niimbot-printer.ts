/**
 * NIIMBOT 打印机库
 * 支持通过 Web Serial API 或 Web Bluetooth API 连接 NIIMBOT B1 打印机
 * 
 * 打印机规格 (B1):
 * - 分辨率: 203 DPI (1mm ≈ 8px)
 * - 标签尺寸: 40mm × 30mm = 320px × 240px
 * - 连接方式: USB 串口 / 蓝牙
 */

import type {
  NiimbotBluetoothClient,
  NiimbotSerialClient,
  ImageEncoder as ImageEncoderType,
} from '@mmote/niimbluelib';

// 打印机状态
export interface PrinterStatus {
  connected: boolean;
  transport: 'serial' | 'ble' | null;
  printerModel: string | null;
  error: string | null;
}

// 打印选项
export interface PrintOptions {
  quantity?: number;
  printDirection?: 'left' | 'top';
  density?: number;
}

// 打印结果
export interface PrintResult {
  success: boolean;
  message: string;
}

// 全局打印机客户端实例
let printerClient: NiimbotBluetoothClient | NiimbotSerialClient | null = null;
let currentTransport: 'serial' | 'ble' | null = null;

// =====================================================
// PNG DPI 元数据嵌入函数 (pHYs chunk)
// =====================================================

/**
 * 在 PNG 图片中嵌入 DPI 元数据 (pHYs chunk)
 * 这让 Niimbot 软件能正确识别图片的物理尺寸，自动填满标签纸。
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
  const IHDR_CHUNK_LENGTH = 25;
  const INSERT_POSITION = PNG_SIGNATURE_LENGTH + IHDR_CHUNK_LENGTH;
  
  // 创建 pHYs chunk
  const phys = createPhysChunk(dpi);
  
  // 检查是否已经有 pHYs chunk
  const existingPhysIndex = findChunk(bytes, 'pHYs');
  
  let newBytes: Uint8Array;
  
  if (existingPhysIndex !== -1) {
    // 已有 pHYs chunk，替换它 (pHYs chunk 固定 21 字节)
    const before = bytes.slice(0, existingPhysIndex);
    const after = bytes.slice(existingPhysIndex + 21);
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
 * 创建 pHYs chunk (21 bytes total)
 * 结构: 4 (length) + 4 (type) + 9 (data) + 4 (crc) = 21 bytes
 */
function createPhysChunk(dpi: number): Uint8Array {
  // DPI 转换为每米像素数
  const INCHES_PER_METER = 39.3701;
  const pixelsPerMeter = Math.round(dpi * INCHES_PER_METER);
  
  // 组装完整的 chunk (21 bytes)
  const chunk = new Uint8Array(21);
  
  // Length field: 9 (big-endian) - 数据部分的长度
  chunk[0] = 0x00;
  chunk[1] = 0x00;
  chunk[2] = 0x00;
  chunk[3] = 0x09;
  
  // Type field: "pHYs" (4 bytes)
  chunk[4] = 0x70; // 'p'
  chunk[5] = 0x48; // 'H'
  chunk[6] = 0x59; // 'Y'
  chunk[7] = 0x73; // 's'
  
  // Data field (9 bytes)
  // X pixels per meter (big-endian)
  chunk[8] = (pixelsPerMeter >> 24) & 0xFF;
  chunk[9] = (pixelsPerMeter >> 16) & 0xFF;
  chunk[10] = (pixelsPerMeter >> 8) & 0xFF;
  chunk[11] = pixelsPerMeter & 0xFF;
  // Y pixels per meter (big-endian)
  chunk[12] = (pixelsPerMeter >> 24) & 0xFF;
  chunk[13] = (pixelsPerMeter >> 16) & 0xFF;
  chunk[14] = (pixelsPerMeter >> 8) & 0xFF;
  chunk[15] = pixelsPerMeter & 0xFF;
  // Unit specifier: 1 = meter
  chunk[16] = 1;
  
  // 计算 CRC32 (type + data, 即 chunk[4..16])
  const typeAndData = chunk.slice(4, 17);
  const crc = crc32(typeAndData);
  
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
    if (bytes[pos + 4] === typeBytes[0] &&
        bytes[pos + 5] === typeBytes[1] &&
        bytes[pos + 6] === typeBytes[2] &&
        bytes[pos + 7] === typeBytes[3]) {
      return pos;
    }
    const length = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
    pos += 12 + length;
  }
  
  return -1;
}

/**
 * CRC32 计算 (PNG 标准)
 */
function crc32(data: Uint8Array): number {
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
 * 检查浏览器是否支持 Web Serial API
 */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * 检查浏览器是否支持 Web Bluetooth API
 */
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * 获取打印机连接状态
 */
export function getPrinterStatus(): PrinterStatus {
  return {
    connected: printerClient !== null,
    transport: currentTransport,
    printerModel: printerClient ? (printerClient.getPrintTaskType() ?? 'B1') : null,
    error: null,
  };
}

/**
 * 通过 USB 串口连接打印机
 */
export async function connectViaSerial(): Promise<PrintResult> {
  if (!isWebSerialSupported()) {
    return {
      success: false,
      message: '您的浏览器不支持 Web Serial API，请使用 Chrome 或 Edge 浏览器',
    };
  }

  try {
    // 动态导入 niimbluelib
    const { NiimbotSerialClient } = await import('@mmote/niimbluelib');
    
    // 断开现有连接
    if (printerClient) {
      await printerClient.disconnect();
    }

    // 创建新的串口客户端
    printerClient = new NiimbotSerialClient();
    currentTransport = 'serial';

    // 连接打印机（会弹出设备选择对话框）
    await printerClient.connect();

    return {
      success: true,
      message: '打印机连接成功（USB）',
    };
  } catch (error: any) {
    printerClient = null;
    currentTransport = null;
    
    if (error.name === 'NotFoundError') {
      return {
        success: false,
        message: '未选择设备，请重试并选择打印机',
      };
    }
    
    return {
      success: false,
      message: `连接失败: ${error.message || error}`,
    };
  }
}

/**
 * 通过蓝牙连接打印机
 */
export async function connectViaBluetooth(): Promise<PrintResult> {
  if (!isWebBluetoothSupported()) {
    return {
      success: false,
      message: '您的浏览器不支持 Web Bluetooth API，请使用 Chrome 或 Edge 浏览器',
    };
  }

  try {
    // 动态导入 niimbluelib
    const { NiimbotBluetoothClient } = await import('@mmote/niimbluelib');
    
    // 断开现有连接
    if (printerClient) {
      await printerClient.disconnect();
    }

    // 创建新的蓝牙客户端
    printerClient = new NiimbotBluetoothClient();
    currentTransport = 'ble';

    // 连接打印机（会弹出设备选择对话框）
    await printerClient.connect();

    return {
      success: true,
      message: '打印机连接成功（蓝牙）',
    };
  } catch (error: any) {
    printerClient = null;
    currentTransport = null;
    
    if (error.name === 'NotFoundError') {
      return {
        success: false,
        message: '未选择设备，请重试并选择打印机',
      };
    }
    
    return {
      success: false,
      message: `连接失败: ${error.message || error}`,
    };
  }
}

/**
 * 断开打印机连接
 */
export async function disconnectPrinter(): Promise<void> {
  if (printerClient) {
    await printerClient.disconnect();
    printerClient = null;
    currentTransport = null;
  }
}

/**
 * 将 Canvas 或 ImageData 转换为可打印的图像数据
 */
async function encodeImage(
  canvas: HTMLCanvasElement,
  printDirection: 'left' | 'top' = 'left'
): Promise<any> {
  const { ImageEncoder } = await import('@mmote/niimbluelib');
  return ImageEncoder.encodeCanvas(canvas, printDirection);
}

/**
 * 将 Data URL 转换为 Canvas
 */
function dataURLToCanvas(dataURL: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建 Canvas 上下文'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataURL;
  });
}

/**
 * 打印图片（通过 Data URL）
 */
export async function printImage(
  imageDataURL: string,
  options: PrintOptions = {}
): Promise<PrintResult> {
  if (!printerClient) {
    return {
      success: false,
      message: '打印机未连接，请先连接打印机',
    };
  }

  const {
    quantity = 1,
    printDirection = 'left',
  } = options;

  try {
    // 将 Data URL 转换为 Canvas
    const canvas = await dataURLToCanvas(imageDataURL);
    
    // 编码图像
    const encoded = await encodeImage(canvas, printDirection);
    
    // 获取打印任务类型
    const printTaskName = printerClient.getPrintTaskType() ?? 'B1';
    console.log(`[Print] Using print task: ${printTaskName}`);
    
    // 创建打印任务
    const printTask = printerClient.abstraction.newPrintTask(printTaskName, {
      totalPages: quantity,
      statusPollIntervalMs: 100,
      statusTimeoutMs: 5000, // 恢复到 niimbluelib 默认的 5 秒超时
    });

    // 执行打印
    console.log('[Print] Initializing print...');
    await printTask.printInit();
    console.log(`[Print] Sending print page data (Quantity: ${quantity})...`);
    await printTask.printPage(encoded, quantity);
    console.log('[Print] Print data sent.');
    await printTask.printEnd();

    return {
      success: true,
      message: `打印成功！已打印 ${quantity} 张标签`,
    };
  } catch (error: any) {
    console.error('[Print] Print failed:', error.message);
    let step = '未知步骤';
    if (error.message.includes('Timeout')) {
      step = '等待打印完成';
    } else if (error.message.includes('printInit')) {
      step = '初始化打印';
    } else if (error.message.includes('printPage')) {
      step = '发送打印数据';
    }
    
    return {
      success: false,
      message: `打印失败: ${error.message || error} (步骤: ${step})`,
    };
  }
}

/**
 * 打印 Canvas 元素
 */
export async function printCanvas(
  canvas: HTMLCanvasElement,
  options: PrintOptions = {}
): Promise<PrintResult> {
  const dataURL = canvas.toDataURL('image/png');
  return printImage(dataURL, options);
}

/**
 * 生成适合 Niimbot B1 的标签图片（双条形码版本）
 * 
 * B1 规格:
 * - 分辨率: 203 DPI (1mm ≈ 8px)
 * - 标签尺寸: 40mm × 30mm = 320px × 240px
 * 
 * 布局（双条形码）：
 * ┌─────────────────────────────────────────────┐
 * │      |||||||||||||||||||||||||||||||        │  系统SKU条形码
 * │              BL260101EKBAM                  │  系统SKU文字
 * │      |||||||||||||||||||||||||||||||        │  内部SKU条形码
 * │              LB-ER-ME-0006                  │  内部SKU文字
 * └─────────────────────────────────────────────┘
 * 
 * 关键优化：
 * 1. 图片尺寸精确匹配打印机物理像素，1:1 输出，避免缩放产生锯齿
 * 2. 条形码模块宽度使用整数像素
 * 3. 禁用抗锯齿
 * 4. 最大化利用纸张空间，最小化边距
 * 5. 文字自动缩放以适应标签宽度
 */
export async function generateLabelForNiimbotB1(
  systemSku: string,
  userSku?: string
): Promise<string> {
  const JsBarcode = (await import('jsbarcode')).default;
  
  // 精确像素尺寸 @ 203 DPI (1mm ≈ 8px)
  // 40mm × 30mm = 320px × 240px
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
  
  // *** 双条形码布局参数 ***
  const BARCODE_HEIGHT = 80;   // 每个条形码高度（增大）
  const TEXT_HEIGHT = 18;      // 每个文字高度
  const GAP = 6;               // 条形码组之间的间距
  
  // 计算总内容高度，用于垂直居中
  // 内容 = 条形码1 + 文字1 + 间距 + 条形码2 + 文字2
  const TOTAL_CONTENT_HEIGHT = BARCODE_HEIGHT + TEXT_HEIGHT + GAP + BARCODE_HEIGHT + TEXT_HEIGHT;
  const MARGIN_TOP = Math.floor((LABEL_HEIGHT - TOTAL_CONTENT_HEIGHT) / 2);  // 自动计算顶部边距使内容居中
  
  // 字体设置
  const FONT_SIZE = 14;
  const FONT_STYLE = `bold ${FONT_SIZE}px Arial, sans-serif`;
  ctx.font = FONT_STYLE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  
  // === 第一个条形码：系统SKU ===
  const barcode1Canvas = document.createElement('canvas');
  JsBarcode(barcode1Canvas, systemSku, {
    format: 'CODE128',
    width: 2,                // 模块宽度（增大使条形码更宽）
    height: BARCODE_HEIGHT,
    displayValue: false,     // 不显示文字（我们单独绘制）
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
  });
  
  // 第一个条形码位置（居中）
  const barcode1X = Math.floor((LABEL_WIDTH - barcode1Canvas.width) / 2);
  const barcode1Y = MARGIN_TOP;
  
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(barcode1Canvas, barcode1X, barcode1Y);
  
  // 第一个条形码下方的文字
  const text1Y = barcode1Y + BARCODE_HEIGHT + TEXT_HEIGHT - 2;
  ctx.fillText(systemSku, Math.floor(LABEL_WIDTH / 2), text1Y);
  
  // === 第二个条形码：内部SKU ===
  // 如果有内部SKU，显示内部SKU；否则显示系统SKU
  const secondSku = userSku || systemSku;
  
  const barcode2Canvas = document.createElement('canvas');
  JsBarcode(barcode2Canvas, secondSku, {
    format: 'CODE128',
    width: 2,                // 模块宽度（与第一个条形码一致）
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
  
  // 获取原始 PNG 数据
  const rawDataURL = canvas.toDataURL('image/png');
  
  // *** 关键：嵌入 203 DPI 元数据，让 Niimbot 软件正确识别图片尺寸 ***
  return addDpiToPng(rawDataURL, 203);
}

/**
 * 一键打印标签（连接 + 打印）
 * 如果未连接，会先尝试连接
 */
export async function quickPrintLabel(
  imageDataURL: string,
  preferSerial: boolean = true
): Promise<PrintResult> {
  // 如果未连接，先尝试连接
  if (!printerClient) {
    const connectResult = preferSerial 
      ? await connectViaSerial()
      : await connectViaBluetooth();
    
    if (!connectResult.success) {
      return connectResult;
    }
  }
  
  // 执行打印
  return printImage(imageDataURL);
}
