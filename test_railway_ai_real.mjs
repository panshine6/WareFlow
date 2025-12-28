// 测试 Railway 后端的 AI 功能（使用真实图片）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'https://web-production-e22eb.up.railway.app';

// 读取真实图片并转换为 base64
const imagePath = '/home/ubuntu/upload/pasted_file_Os0XwZ_81c105025e5d58e848d6af57e470b78b.jpg';
const imageBuffer = fs.readFileSync(imagePath);
const imageBase64 = imageBuffer.toString('base64');

console.log(`Image size: ${imageBuffer.length} bytes`);
console.log(`Base64 length: ${imageBase64.length} characters`);

async function testAICountProducts() {
  try {
    console.log('\nTesting Railway AI countProducts endpoint...');
    
    const response = await fetch(`${API_BASE}/api/trpc/ai.countProducts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        json: {
          imageBase64: imageBase64
        }
      })
    });

    const data = await response.json();
    
    if (response.ok && !data.error) {
      console.log('✅ AI countProducts API is working!');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ API returned an error:');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testAICountProducts();
