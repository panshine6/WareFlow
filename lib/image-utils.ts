/**
 * 图片处理工具函数
 * 提供图片压缩、格式转换等功能
 */

/**
 * 压缩图片到指定最大尺寸
 * @param base64 原始图片的 Base64 数据（不含 data:image/...;base64, 前缀）
 * @param maxSize 最大边长（默认 2048）
 * @param quality JPEG 质量（0-1，默认 0.85）
 * @returns 压缩后的 Base64 数据（不含前缀）
 */
export async function compressImage(
  base64: string,
  maxSize: number = 2048,
  quality: number = 0.85
): Promise<string> {
  // 仅在 Web 平台使用 Canvas 压缩
  if (typeof window === "undefined" || typeof document === "undefined") {
    console.log("[ImageUtils] Not in browser environment, returning original");
    return base64;
  }

  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      
      img.onload = () => {
        try {
          const { width, height } = img;
          console.log(`[ImageUtils] Original size: ${width}×${height}`);

          // 计算缩放比例
          let newWidth = width;
          let newHeight = height;

          if (width > maxSize || height > maxSize) {
            const ratio = Math.min(maxSize / width, maxSize / height);
            newWidth = Math.round(width * ratio);
            newHeight = Math.round(height * ratio);
            console.log(`[ImageUtils] Resizing to: ${newWidth}×${newHeight} (ratio: ${ratio.toFixed(3)})`);
          } else {
            console.log(`[ImageUtils] Image already within limits, no resize needed`);
          }

          // 创建 Canvas
          const canvas = document.createElement("canvas");
          canvas.width = newWidth;
          canvas.height = newHeight;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }

          // 绘制图片
          ctx.drawImage(img, 0, 0, newWidth, newHeight);

          // 导出为 JPEG
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const compressedBase64 = dataUrl.split(",")[1];

          // 计算压缩效果
          const originalSize = base64.length;
          const compressedSize = compressedBase64.length;
          const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
          console.log(
            `[ImageUtils] Compression complete: ${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB (${compressionRatio}% reduction)`
          );

          resolve(compressedBase64);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error("Failed to load image"));
      };

      // 加载图片
      img.src = `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 将 Data URL 转换为 Base64（不含前缀）
 */
export function dataUrlToBase64(dataUrl: string): string {
  const parts = dataUrl.split(",");
  return parts.length > 1 ? parts[1] : dataUrl;
}

/**
 * 将 Base64 转换为 Data URL
 */
export function base64ToDataUrl(base64: string, mimeType: string = "image/jpeg"): string {
  if (base64.startsWith("data:")) {
    return base64;
  }
  return `data:${mimeType};base64,${base64}`;
}

/**
 * 压缩图片并返回 Data URL
 * @param dataUrl 原始图片的 Data URL
 * @param maxSize 最大边长（默认 2048）
 * @param quality JPEG 质量（0-1，默认 0.85）
 * @returns 压缩后的 Data URL
 */
export async function compressImageDataUrl(
  dataUrl: string,
  maxSize: number = 2048,
  quality: number = 0.85
): Promise<{ dataUrl: string; base64: string }> {
  const base64 = dataUrlToBase64(dataUrl);
  const compressedBase64 = await compressImage(base64, maxSize, quality);
  const compressedDataUrl = base64ToDataUrl(compressedBase64);
  return {
    dataUrl: compressedDataUrl,
    base64: compressedBase64,
  };
}
