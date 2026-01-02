/**
 * 生成示例双条形码标签
 * 使用 Node.js canvas 模拟浏览器环境
 */

const { createCanvas } = require('canvas');
const JsBarcode = require('jsbarcode');
const fs = require('fs');

// 标签尺寸 @ 203 DPI
const LABEL_WIDTH = 320;   // 40mm × 8 = 320px
const LABEL_HEIGHT = 240;  // 30mm × 8 = 240px

// 双条形码布局参数（与 niimbot-printer.ts 一致）
const BARCODE_HEIGHT = 80;   // 每个条形码高度（增大）
const TEXT_HEIGHT = 18;      // 每个文字高度
const GAP = 6;               // 条形码组之间的间距

// 计算总内容高度，用于垂直居中
const TOTAL_CONTENT_HEIGHT = BARCODE_HEIGHT + TEXT_HEIGHT + GAP + BARCODE_HEIGHT + TEXT_HEIGHT;
const MARGIN_TOP = Math.floor((LABEL_HEIGHT - TOTAL_CONTENT_HEIGHT) / 2);

// 示例 SKU
const systemSku = 'BL260102VWI2O';
const userSku = 'LB-ER-ME-0008';

// 创建主 canvas
const canvas = createCanvas(LABEL_WIDTH, LABEL_HEIGHT);
const ctx = canvas.getContext('2d');

// 白色背景
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);

// 设置文字样式
ctx.fillStyle = '#000000';

// 字体设置
const FONT_SIZE = 14;
ctx.font = `bold ${FONT_SIZE}px Arial, sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'bottom';

// === 第一个条形码：系统SKU ===
const barcode1Canvas = createCanvas();
JsBarcode(barcode1Canvas, systemSku, {
  format: 'CODE128',
  width: 2,
  height: BARCODE_HEIGHT,
  displayValue: false,
  margin: 0,
  background: '#ffffff',
  lineColor: '#000000',
});

// 第一个条形码位置（居中）
const barcode1X = Math.floor((LABEL_WIDTH - barcode1Canvas.width) / 2);
const barcode1Y = MARGIN_TOP;

ctx.drawImage(barcode1Canvas, barcode1X, barcode1Y);

// 第一个条形码下方的文字
const text1Y = barcode1Y + BARCODE_HEIGHT + TEXT_HEIGHT - 2;
ctx.fillText(systemSku, Math.floor(LABEL_WIDTH / 2), text1Y);

// === 第二个条形码：内部SKU ===
const barcode2Canvas = createCanvas();
JsBarcode(barcode2Canvas, userSku, {
  format: 'CODE128',
  width: 2,
  height: BARCODE_HEIGHT,
  displayValue: false,
  margin: 0,
  background: '#ffffff',
  lineColor: '#000000',
});

// 第二个条形码位置（居中）
const barcode2X = Math.floor((LABEL_WIDTH - barcode2Canvas.width) / 2);
const barcode2Y = text1Y + GAP;

ctx.drawImage(barcode2Canvas, barcode2X, barcode2Y);

// 第二个条形码下方的文字
const text2Y = barcode2Y + BARCODE_HEIGHT + TEXT_HEIGHT - 2;
ctx.fillText(userSku, Math.floor(LABEL_WIDTH / 2), text2Y);

// 保存为 PNG
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('/home/ubuntu/fashion-accessories-inventory/sample-label-new.png', buffer);

console.log('示例标签已生成: sample-label-new.png');
console.log(`标签尺寸: ${LABEL_WIDTH}x${LABEL_HEIGHT}px`);
console.log(`顶部边距: ${MARGIN_TOP}px (自动居中)`);
console.log(`条形码高度: ${BARCODE_HEIGHT}px`);
console.log(`系统SKU: ${systemSku}`);
console.log(`内部SKU: ${userSku}`);
