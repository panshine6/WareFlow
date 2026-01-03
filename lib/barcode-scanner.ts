/**
 * 条形码扫描工具库
 * 支持从图片中识别条形码并解析 SKU
 */

import { validateSKU } from './barcode';

// 获取 API 基础 URL
const getApiBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  return "https://web-production-e22eb.up.railway.app";
};

/**
 * 条形码扫描结果
 */
export interface BarcodeScanResult {
  /** 是否成功识别 */
  success: boolean;
  /** 识别到的条形码内容 */
  barcodeValue?: string;
  /** 条形码类型 */
  barcodeType?: 'systemSku' | 'userSku' | 'boxId' | 'unknown';
  /** 错误信息 */
  error?: string;
}

/**
 * 产品查询结果
 */
export interface ProductLookupResult {
  /** 是否找到产品 */
  found: boolean;
  /** 产品信息 */
  product?: {
    id: string;
    sku: string;
    systemSku?: string;
    quantity: number;
    storageLocation: string;
    detailImageUri: string;
  };
  /** 错误信息 */
  error?: string;
}

/**
 * Box 查询结果
 */
export interface BoxLookupResult {
  /** 是否找到 Box */
  found: boolean;
  /** Box 信息 */
  box?: {
    id: string;
    name: string;
    location: string;
    items: Array<{
      productId: string;
      sku: string;
      systemSku?: string;
      quantity: number;
    }>;
  };
  /** 错误信息 */
  error?: string;
}

/**
 * 判断条形码类型
 * - 系统 SKU: LB + YYMMDD + 4位随机数 + 校验位 (如 LB260103EKBAM)
 * - Box ID: XX-XX-XX-Box-N (如 LB-RF-GM-Box-1)
 * - 用户 SKU: 其他格式
 */
export function detectBarcodeType(value: string): 'systemSku' | 'userSku' | 'boxId' | 'unknown' {
  if (!value || value.length < 3) {
    return 'unknown';
  }
  
  // 检查是否为 Box ID (包含 -Box- 或 -box-)
  if (value.toLowerCase().includes('-box-')) {
    return 'boxId';
  }
  
  // 检查是否为系统 SKU (LB 开头 + 校验位验证)
  // 同时兼容旧版本的 BL 前缀
  if ((value.startsWith('LB') || value.startsWith('BL')) && value.length === 13) {
    if (validateSKU(value)) {
      return 'systemSku';
    }
  }
  
  // 其他情况视为用户 SKU
  return 'userSku';
}

/**
 * 从图片中识别条形码
 * 使用 AI Vision API 识别条形码内容
 */
export async function scanBarcodeFromImage(imageBase64: string): Promise<BarcodeScanResult> {
  const apiBaseUrl = getApiBaseUrl();
  
  try {
    console.log("[Barcode Scanner] Calling scanBarcode API...");
    
    const response = await fetch(`${apiBaseUrl}/api/trpc/ai.scanBarcode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          imageBase64,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Barcode Scanner] API error:", errorText);
      return {
        success: false,
        error: `API 请求失败: ${response.statusText}`,
      };
    }

    const data = await response.json();
    console.log("[Barcode Scanner] API response:", data);
    
    const result = data.result?.data?.json;
    
    if (!result || !result.barcodeValue) {
      return {
        success: false,
        error: "未能识别到条形码",
      };
    }
    
    const barcodeType = detectBarcodeType(result.barcodeValue);
    
    return {
      success: true,
      barcodeValue: result.barcodeValue,
      barcodeType,
    };
  } catch (error: any) {
    console.error("[Barcode Scanner] Error:", error);
    return {
      success: false,
      error: error.message || "条形码识别失败",
    };
  }
}

/**
 * 根据条形码查找产品
 */
export async function lookupProductByBarcode(barcodeValue: string): Promise<ProductLookupResult> {
  const apiBaseUrl = getApiBaseUrl();
  const barcodeType = detectBarcodeType(barcodeValue);
  
  try {
    console.log("[Barcode Scanner] Looking up product:", barcodeValue, "type:", barcodeType);
    
    // 根据条形码类型选择查询方式
    let searchParam: string;
    if (barcodeType === 'systemSku') {
      searchParam = barcodeValue;
    } else if (barcodeType === 'userSku') {
      searchParam = barcodeValue;
    } else {
      return {
        found: false,
        error: "无效的条形码类型",
      };
    }
    
    // 调用产品搜索 API
    const response = await fetch(`${apiBaseUrl}/api/trpc/products.search?input=${encodeURIComponent(JSON.stringify({ json: { sku: searchParam } }))}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Barcode Scanner] Search API error:", errorText);
      return {
        found: false,
        error: `搜索失败: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const products = data.result?.data?.json || [];
    
    if (products.length === 0) {
      return {
        found: false,
        error: "未找到对应的产品",
      };
    }
    
    // 返回第一个匹配的产品
    const product = products[0];
    return {
      found: true,
      product: {
        id: product.id,
        sku: product.sku,
        systemSku: product.systemSku,
        quantity: product.quantity,
        storageLocation: product.storageLocation,
        detailImageUri: product.detailImageUri,
      },
    };
  } catch (error: any) {
    console.error("[Barcode Scanner] Lookup error:", error);
    return {
      found: false,
      error: error.message || "查询失败",
    };
  }
}

/**
 * 根据 Box ID 查找 Box 及其包含的产品
 */
export async function lookupBoxByBarcode(boxId: string): Promise<BoxLookupResult> {
  const apiBaseUrl = getApiBaseUrl();
  
  try {
    console.log("[Barcode Scanner] Looking up box:", boxId);
    
    const response = await fetch(`${apiBaseUrl}/api/trpc/boxes.getById?input=${encodeURIComponent(JSON.stringify({ json: { id: boxId } }))}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Barcode Scanner] Box API error:", errorText);
      return {
        found: false,
        error: `查询失败: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const box = data.result?.data?.json;
    
    if (!box) {
      return {
        found: false,
        error: "未找到对应的 Box",
      };
    }
    
    return {
      found: true,
      box: {
        id: box.id,
        name: box.name,
        location: box.location,
        items: box.items || [],
      },
    };
  } catch (error: any) {
    console.error("[Barcode Scanner] Box lookup error:", error);
    return {
      found: false,
      error: error.message || "查询失败",
    };
  }
}

/**
 * 综合扫描处理：识别条形码并查找对应的产品或 Box
 */
export async function scanAndLookup(imageBase64: string): Promise<{
  scanResult: BarcodeScanResult;
  productResult?: ProductLookupResult;
  boxResult?: BoxLookupResult;
}> {
  // 第一步：识别条形码
  const scanResult = await scanBarcodeFromImage(imageBase64);
  
  if (!scanResult.success || !scanResult.barcodeValue) {
    return { scanResult };
  }
  
  // 第二步：根据条形码类型查找对应数据
  if (scanResult.barcodeType === 'boxId') {
    const boxResult = await lookupBoxByBarcode(scanResult.barcodeValue);
    return { scanResult, boxResult };
  } else if (scanResult.barcodeType === 'systemSku' || scanResult.barcodeType === 'userSku') {
    const productResult = await lookupProductByBarcode(scanResult.barcodeValue);
    return { scanResult, productResult };
  }
  
  return { scanResult };
}
