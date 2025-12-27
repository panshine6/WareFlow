# Expo Go 连接问题解决方案

## 🔍 问题分析

### 当前问题
Expo Go 尝试使用 HTTP 连接开发服务器，但 Sandbox 的临时域名只支持 HTTPS。

**错误信息**:
```
Could not connect to development server.
URL: http://8081-idf2b3074077ybpvbjl3s-089ebb62.us2.manus.computer:8081/...
```

**根本原因**:
1. Expo Go 默认使用 HTTP 协议
2. Sandbox 临时域名需要 HTTPS
3. 移动设备无法直接访问 Sandbox 的内部网络

---

## 💡 解决方案

### 方案 1: 使用 Expo Tunnel（推荐）✅

**原理**: 通过 Expo 的隧道服务，将开发服务器暴露到公网。

**优势**:
- ✅ 无需 HTTPS 配置
- ✅ 自动处理网络问题
- ✅ 支持任何网络环境

**命令**:
```bash
npx expo start --tunnel
```

### 方案 2: 使用 ngrok

**原理**: 使用 ngrok 创建一个公网隧道。

**步骤**:
1. 安装 ngrok
2. 运行 `ngrok http 8081`
3. 使用生成的 HTTPS URL

### 方案 3: 使用 iPhone 浏览器

**直接在 Safari 中打开**:
```
https://8081-idf2b3074077ybpvbjl3s-089ebb62.us2.manus.computer
```

**限制**: 相机功能可能受限

---

## 🚀 实施步骤

### 步骤 1: 停止当前开发服务器

```bash
pkill -f "expo start"
```

### 步骤 2: 使用 Tunnel 模式启动

```bash
cd /home/ubuntu/fashion-accessories-inventory
npx expo start --tunnel
```

### 步骤 3: 扫描二维码

Expo 会生成一个新的二维码，使用 Expo Go 扫描即可。

---

## ⚠️ 注意事项

### Tunnel 模式的限制

1. **速度较慢**: 数据需要经过 Expo 服务器中转
2. **需要网络**: Sandbox 和手机都需要能访问互联网
3. **可能不稳定**: 依赖 Expo 的隧道服务

### 替代方案

如果 Tunnel 模式不工作，可以：
1. 使用 iPhone 浏览器访问
2. 等待 EAS Build（需要 Apple Developer 账号）
3. 使用 Android 设备测试（如果有）

---

## 📝 测试清单

- [ ] 停止当前开发服务器
- [ ] 启动 Tunnel 模式
- [ ] 扫描新的二维码
- [ ] 测试应用加载
- [ ] 测试基本功能
- [ ] 测试相机功能
- [ ] 测试图片上传
- [ ] 测试云同步

---

## 🔗 相关文档

- Expo Tunnel 文档: https://docs.expo.dev/more/expo-cli/#tunneling
- Expo Go 文档: https://docs.expo.dev/get-started/expo-go/
