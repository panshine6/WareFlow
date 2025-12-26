import ExcelJS from "exceljs";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { Product } from "@/types/product";

/**
 * 将图片 URI 转换为 base64
 */
async function imageUriToBase64(uri: string): Promise<string> {
  try {
    // 使用 fetch 读取图片文件
    const response = await fetch(uri);
    const blob = await response.blob();
    
    // 将 blob 转换为 base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // 移除 data:image/xxx;base64, 前缀
        const base64Data = result.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    return base64;
  } catch (error) {
    console.error("Failed to convert image to base64:", error);
    throw error;
  }
}

/**
 * 获取图片扩展名
 */
function getImageExtension(uri: string): "jpeg" | "png" | "gif" {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.endsWith(".png")) return "png";
  if (lowerUri.endsWith(".gif")) return "gif";
  return "jpeg"; // 默认为 jpeg
}

/**
 * 导出产品数据为店小秘格式的 Excel 文件
 */
export async function exportToExcel(products: Product[]): Promise<void> {
  try {
    // 创建工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("产品");

    // 设置默认行高（为图片预留空间）
    worksheet.properties.defaultRowHeight = 80;

    // 定义列
    worksheet.columns = [
      { header: "SKU", key: "sku", width: 20 },
      { header: "产品标题", key: "title", width: 30 },
      { header: "产品图片", key: "image", width: 15 },
      { header: "库存数量", key: "quantity", width: 12 },
      { header: "价格(USD)", key: "price", width: 12 },
      { header: "存储位置", key: "location", width: 20 },
    ];

    // 设置表头样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // 添加数据和图片
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const rowNumber = i + 2; // 从第2行开始（第1行是表头）

      // 添加行数据
      worksheet.addRow({
        sku: product.sku,
        title: `约饰品:${product.sku}`,
        image: "", // 图片列留空，稍后插入图片
        quantity: product.quantity,
        price: "", // 价格留空，根据店小秘要求调整
        location: product.storageLocation,
      });

      // 插入细节图片（第一张照片）
      if (product.detailImageUri) {
        try {
          const base64 = await imageUriToBase64(product.detailImageUri);
          const extension = getImageExtension(product.detailImageUri);

          const imageId = workbook.addImage({
            base64,
            extension,
          });

          // 将图片添加到单元格（C列，产品图片列）
          worksheet.addImage(imageId, {
            tl: { col: 2, row: rowNumber - 1 }, // C列（索引2），对应行
            ext: { width: 80, height: 80 },
          });
        } catch (error) {
          console.error(
            `Failed to add image for product ${product.sku}:`,
            error,
          );
        }
      }
    }

    // 生成 Excel 文件
    const buffer = await workbook.xlsx.writeBuffer();
    const uint8Array = new Uint8Array(buffer);

    // 保存到文件系统
    const timestamp = new Date().getTime();
    const fileName = `饰品入库_${timestamp}.xlsx`;
    const file = new File(Paths.cache, fileName);
    
    // 写入二进制数据
    await file.write(uint8Array);

    // 分享文件
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dialogTitle: "导出产品数据",
        UTI: "com.microsoft.excel.xlsx",
      });
    } else {
      throw new Error("分享功能不可用");
    }
  } catch (error) {
    console.error("Excel export failed:", error);
    throw error;
  }
}

/**
 * 生成店小秘兼容格式的 Excel（包含额外字段）
 */
export async function exportToDianxiaomiFormat(
  products: Product[],
): Promise<void> {
  // 使用相同的导出逻辑
  return exportToExcel(products);
}
