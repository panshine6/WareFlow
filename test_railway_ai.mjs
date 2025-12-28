// 测试 Railway 后端的 AI 功能
const API_BASE = 'https://web-production-e22eb.up.railway.app';

// 一个简单的 1x1 像素的 JPEG 图片（base64 编码）
const TEST_IMAGE_BASE64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==';

async function testAICountProducts() {
  try {
    console.log('Testing Railway AI countProducts endpoint...');
    
    const response = await fetch(`${API_BASE}/api/trpc/ai.countProducts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        json: {
          imageBase64: TEST_IMAGE_BASE64
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
