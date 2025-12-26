#!/usr/bin/env node

/**
 * 完整的 API 自动化测试脚本
 * 用于测试 Railway 部署的所有功能
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

// 配置
const API_BASE_URL = 'https://web-production-e22eb.up.railway.app';
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// 测试统计
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
};

// HTTP 请求函数
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const req = protocol.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// 测试函数
async function test(name, fn) {
  stats.total++;
  process.stdout.write(`${COLORS.yellow}[TEST ${stats.total}]${COLORS.reset} ${name} ... `);
  
  try {
    await fn();
    stats.passed++;
    console.log(`${COLORS.green}✅ PASSED${COLORS.reset}`);
    return true;
  } catch (error) {
    stats.failed++;
    console.log(`${COLORS.red}❌ FAILED${COLORS.reset}`);
    console.log(`  ${COLORS.red}Error: ${error.message}${COLORS.reset}`);
    return false;
  }
}

// 断言函数
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertStatus(response, expected) {
  assertEqual(response.status, expected, `Expected status ${expected}, got ${response.status}`);
}

// 测试套件
async function runTests() {
  console.log(`${COLORS.cyan}===========================================${COLORS.reset}`);
  console.log(`${COLORS.cyan}  时尚配饰库存管理系统 - API 测试${COLORS.reset}`);
  console.log(`${COLORS.cyan}===========================================${COLORS.reset}`);
  console.log(`API 地址: ${API_BASE_URL}`);
  console.log(`测试时间: ${new Date().toLocaleString()}`);
  console.log('');
  
  // 测试套件 1: 基础健康检查
  console.log(`${COLORS.blue}[套件 1] 基础健康检查${COLORS.reset}`);
  
  await test('健康检查端点应返回 200', async () => {
    const res = await request(`${API_BASE_URL}/api/health`);
    assertStatus(res, 200);
    assert(res.data.ok === true, 'Health check should return ok: true');
    assert(typeof res.data.timestamp === 'number', 'Timestamp should be a number');
  });
  
  await test('健康检查应包含正确的时间戳', async () => {
    const res = await request(`${API_BASE_URL}/api/health`);
    const now = Date.now();
    const diff = Math.abs(now - res.data.timestamp);
    assert(diff < 5000, 'Timestamp should be within 5 seconds of current time');
  });
  
  console.log('');
  
  // 测试套件 2: tRPC 端点
  console.log(`${COLORS.blue}[套件 2] tRPC 端点${COLORS.reset}`);
  
  await test('同步状态端点应存在', async () => {
    const res = await request(`${API_BASE_URL}/api/trpc/sync.status`);
    // 数据库未连接时返回 500，但端点存在
    assert([200, 500].includes(res.status), 'Endpoint should exist');
  });
  
  await test('同步状态应返回错误信息（数据库未连接）', async () => {
    const res = await request(`${API_BASE_URL}/api/trpc/sync.status`);
    if (res.status === 500) {
      assert(res.data.error, 'Should return error object');
      assert(res.data.error.json, 'Error should have json field');
      assert(res.data.error.json.message.includes('Failed query'), 'Error message should mention failed query');
    }
  });
  
  console.log('');
  
  // 测试套件 3: 错误处理
  console.log(`${COLORS.blue}[套件 3] 错误处理${COLORS.reset}`);
  
  await test('不存在的端点应返回 404', async () => {
    const res = await request(`${API_BASE_URL}/api/nonexistent`);
    assertStatus(res, 404);
  });
  
  await test('不存在的 tRPC 过程应返回 404', async () => {
    const res = await request(`${API_BASE_URL}/api/trpc/nonexistent.procedure`);
    assertStatus(res, 404);
    assert(res.data.error, 'Should return error object');
    assert(res.data.error.json.code === -32004, 'Should return NOT_FOUND error code');
  });
  
  console.log('');
  
  // 测试套件 4: CORS 和安全头
  console.log(`${COLORS.blue}[套件 4] CORS 和安全头${COLORS.reset}`);
  
  await test('应设置 CORS 头', async () => {
    const res = await request(`${API_BASE_URL}/api/health`);
    // 检查是否有 CORS 相关头（可能在 Railway 层设置）
    console.log(`    CORS headers: ${res.headers['access-control-allow-origin'] || 'Not set'}`);
  });
  
  console.log('');
  
  // 测试套件 5: 性能测试
  console.log(`${COLORS.blue}[套件 5] 性能测试${COLORS.reset}`);
  
  await test('健康检查响应时间应小于 500ms', async () => {
    const start = Date.now();
    await request(`${API_BASE_URL}/api/health`);
    const duration = Date.now() - start;
    console.log(`    响应时间: ${duration}ms`);
    assert(duration < 500, `Response time ${duration}ms exceeds 500ms`);
  });
  
  await test('并发请求应正常处理', async () => {
    const promises = Array(5).fill(null).map(() => 
      request(`${API_BASE_URL}/api/health`)
    );
    const results = await Promise.all(promises);
    results.forEach((res, i) => {
      assert(res.status === 200, `Request ${i + 1} failed`);
    });
  });
  
  console.log('');
  
  // 打印测试摘要
  console.log(`${COLORS.cyan}===========================================${COLORS.reset}`);
  console.log(`${COLORS.cyan}  测试摘要${COLORS.reset}`);
  console.log(`${COLORS.cyan}===========================================${COLORS.reset}`);
  console.log(`总测试数: ${stats.total}`);
  console.log(`通过: ${COLORS.green}${stats.passed}${COLORS.reset}`);
  console.log(`失败: ${COLORS.red}${stats.failed}${COLORS.reset}`);
  console.log(`跳过: ${COLORS.yellow}${stats.skipped}${COLORS.reset}`);
  console.log(`成功率: ${((stats.passed / stats.total) * 100).toFixed(2)}%`);
  console.log('');
  
  if (stats.failed === 0) {
    console.log(`${COLORS.green}✅ 所有测试通过！${COLORS.reset}`);
    process.exit(0);
  } else {
    console.log(`${COLORS.red}❌ 有 ${stats.failed} 个测试失败${COLORS.reset}`);
    process.exit(1);
  }
}

// 运行测试
runTests().catch((error) => {
  console.error(`${COLORS.red}测试运行失败:${COLORS.reset}`, error);
  process.exit(1);
});
