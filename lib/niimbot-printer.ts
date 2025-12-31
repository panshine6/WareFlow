/**
 * NIIMBOT 打印机库
 * 支持通过 Web Serial API 或 Web Bluetooth API 连接 NIIMBOT B1 打印机
 * 
 * 打印机规格 (B1):
 * - 分辨率: 203 DPI
 * - 标签尺寸: 50mm × 30mm = 400px × 240px
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
    
    // 创建打印任务
    const printTask = printerClient.abstraction.newPrintTask(printTaskName, {
      totalPages: quantity,
      statusPollIntervalMs: 100,
      statusTimeoutMs: 30000,
    });

    // 执行打印
    await printTask.printInit();
    await printTask.printPage(encoded, quantity);
    await printTask.waitForFinished();
    await printTask.printEnd();

    return {
      success: true,
      message: `打印成功！已打印 ${quantity} 张标签`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `打印失败: ${error.message || error}`,
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
 * 生成适合 NIIMBOT B1 的标签图片
 * 
 * B1 规格:
 * - 分辨率: 203 DPI
 * - 标签尺寸: 50mm × 30mm = 400px × 240px
 */
export async function generateLabelForNiimbotB1(
  systemSku: string,
  userSku?: string
): Promise<string> {
  const JsBarcode = (await import('jsbarcode')).default;
  
  // 精确像素尺寸 @ 203 DPI (1mm ≈ 8px)
  const LABEL_WIDTH = 400;   // 50mm × 8 = 400px
  const LABEL_HEIGHT = 240;  // 30mm × 8 = 240px
  
  // 创建主 canvas
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  
  // 禁用抗锯齿，确保线条锐利
  ctx.imageSmoothingEnabled = false;
  
  // 白色背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
  
  // 设置文字样式
  ctx.fillStyle = '#000000';
  
  // 边距
  const MARGIN = 16;
  const TEXT_HEIGHT = 48;  // 底部文字区域高度
  
  // 1. 生成条形码
  const barcodeAreaHeight = LABEL_HEIGHT - TEXT_HEIGHT - MARGIN * 2;
  
  const barcodeCanvas = document.createElement('canvas');
  JsBarcode(barcodeCanvas, systemSku, {
    format: 'CODE128',
    width: 2,                // 模块宽度
    height: barcodeAreaHeight,
    displayValue: false,     // 不显示文字（我们单独绘制）
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
  });
  
  // 条形码水平居中
  const barcodeX = Math.floor((LABEL_WIDTH - barcodeCanvas.width) / 2);
  const barcodeY = MARGIN;
  
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(barcodeCanvas, barcodeX, barcodeY);
  
  // 2. 绘制底部文字
  const textY = LABEL_HEIGHT - 8;
  const FONT_SIZE = 24;
  const FONT_STYLE = `bold ${FONT_SIZE}px Arial, sans-serif`;
  const SKU_GAP = 32;
  
  if (userSku) {
    ctx.font = FONT_STYLE;
    
    const systemSkuWidth = Math.ceil(ctx.measureText(systemSku).width);
    const userSkuWidth = Math.ceil(ctx.measureText(userSku).width);
    
    const totalWidth = systemSkuWidth + SKU_GAP + userSkuWidth;
    const startX = Math.floor((LABEL_WIDTH - totalWidth) / 2);
    
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(systemSku, startX, textY);
    ctx.fillText(userSku, startX + systemSkuWidth + SKU_GAP, textY);
  } else {
    ctx.font = FONT_STYLE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(systemSku, Math.floor(LABEL_WIDTH / 2), textY);
  }
  
  return canvas.toDataURL('image/png');
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
