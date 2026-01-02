// 测试条形码生成功能
const { createCanvas } = require('canvas');
const JsBarcode = require('jsbarcode');

// 模拟 generateLabelForNiimbotD110 函数的核心逻辑
async function testGenerateLabel(systemSku, companySku) {
  // 标签尺寸: 40mm x 30mm, 300dpi
  const dpi = 300;
  const widthMm = 40;
  const heightMm = 30;
  const width = Math.round(widthMm * dpi / 25.4);  // 472px
  const height = Math.round(heightMm * dpi / 25.4); // 354px
  
  console.log(`标签尺寸: ${width}px x ${height}px (${widthMm}mm x ${heightMm}mm @ ${dpi}dpi)`);
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // 白色背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  
  // 计算布局
  const padding = 15;
  const barcodeHeight = 100;
  const textHeight = 30;
  const spacing = 10;
  
  // 第一个条形码 (系统SKU)
  const barcode1Canvas = createCanvas(width - padding * 2, barcodeHeight);
  try {
    JsBarcode(barcode1Canvas, systemSku, {
      format: 'CODE128',
      width: 2,
      height: barcodeHeight - 20,
      displayValue: false,
      margin: 0,
    });
    ctx.drawImage(barcode1Canvas, padding, padding);
    console.log(`✓ 系统SKU条形码生成成功: ${systemSku}`);
  } catch (e) {
    console.log(`✗ 系统SKU条形码生成失败: ${e.message}`);
  }
  
  // 系统SKU文字
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(systemSku, width / 2, padding + barcodeHeight + textHeight - 5);
  
  // 第二个条形码 (公司SKU)
  const barcode2Y = padding + barcodeHeight + textHeight + spacing;
  const barcode2Canvas = createCanvas(width - padding * 2, barcodeHeight);
  try {
    JsBarcode(barcode2Canvas, companySku, {
      format: 'CODE128',
      width: 2,
      height: barcodeHeight - 20,
      displayValue: false,
      margin: 0,
    });
    ctx.drawImage(barcode2Canvas, padding, barcode2Y);
    console.log(`✓ 公司SKU条形码生成成功: ${companySku}`);
  } catch (e) {
    console.log(`✗ 公司SKU条形码生成失败: ${e.message}`);
  }
  
  // 公司SKU文字
  ctx.fillText(companySku, width / 2, barcode2Y + barcodeHeight + textHeight - 5);
  
  // 保存为PNG
  const fs = require('fs');
  const buffer = canvas.toBuffer('image/png');
  const filename = `/home/ubuntu/fashion-accessories-inventory/test-assets/label_${systemSku}_${companySku}.png`;
  fs.writeFileSync(filename, buffer);
  console.log(`✓ 标签已保存: ${filename}`);
  
  return filename;
}

// 运行测试
async function main() {
  console.log('=== 测试双条形码标签生成 ===\n');
  
  // 测试用例
  const testCases = [
    { systemSku: 'BL260101EKBAM', companySku: 'LB-ER-ME-0006' },
    { systemSku: 'BL2601017BJ3I', companySku: 'LB-ER-ME-0005' },
    { systemSku: 'BL25123106FAL', companySku: 'LB-ER-ME-0002' },
  ];
  
  for (const tc of testCases) {
    console.log(`\n测试: ${tc.systemSku} / ${tc.companySku}`);
    await testGenerateLabel(tc.systemSku, tc.companySku);
  }
  
  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
