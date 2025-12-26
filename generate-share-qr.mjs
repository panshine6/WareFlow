import QRCode from 'qrcode';
import fs from 'fs';

const EXPO_URL = 'https://8081-idf2b3074077ybpvbjl3s-089ebb62.us2.manus.computer';
const API_URL = 'https://3000-idf2b3074077ybpvbjl3s-089ebb62.us2.manus.computer';

// Expo Go deep link format
const expoGoUrl = `exp://${EXPO_URL.replace('https://', '')}`;

console.log('\n='.repeat(80));
console.log('🎉 时尚饰品入库助手 - 应用分享信息');
console.log('='.repeat(80));
console.log('\n📱 应用访问方式：\n');
console.log('方式 1: 使用 Expo Go 应用（推荐用于测试）');
console.log('-----------------------------------------------');
console.log('1. 在 iPhone 上从 App Store 下载 "Expo Go" 应用');
console.log('2. 打开 Expo Go，扫描下方二维码');
console.log('3. 应用会自动加载并运行\n');
console.log(`📲 Expo Go 链接: ${expoGoUrl}\n`);

console.log('方式 2: 直接在浏览器中访问（Web版本）');
console.log('-----------------------------------------------');
console.log(`🌐 Web访问地址: ${EXPO_URL}\n`);

console.log('🔧 后端API地址：');
console.log('-----------------------------------------------');
console.log(`🔗 API地址: ${API_URL}`);
console.log(`✅ 健康检查: ${API_URL}/api/health\n`);

console.log('⚠️  重要提示：');
console.log('-----------------------------------------------');
console.log('• 这是开发环境的临时链接，sandbox重启后会失效');
console.log('• 建议将后端部署到 Railway 以获得永久API地址');
console.log('• 使用 Expo EAS Build 可以构建独立的 iOS 应用\n');

// Generate QR code
const qrPath = '/home/ubuntu/fashion-accessories-inventory/expo-qr-code.png';
await QRCode.toFile(qrPath, expoGoUrl, {
  width: 500,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
});

console.log(`✅ 二维码已生成: ${qrPath}`);
console.log('='.repeat(80));
console.log('\n');
