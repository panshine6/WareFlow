# README 更新建议

建议在主 README.md 文件顶部添加以下内容：

---

## 🚀 快速测试（iPhone 用户）

### 方法 1：使用 Expo Go（推荐）

1. **下载 Expo Go**：在 App Store 搜索 "Expo Go" 并安装

2. **连接应用**：打开 Expo Go，输入以下 URL：
   ```
   exp://u.expo.dev/0f415cb3-1cf9-4d4f-9a3e-dede63dd2193
   ```
   或扫描 QR 码（见 `expo_qr_code.png`）

3. **登录测试**：使用 PIN 码 `123456`

4. **开始使用**：体验完整功能，包括相机和 AI 识别

📖 **详细指南**：查看 [iOS 测试指南](IOS_TESTING_GUIDE.md)

### 方法 2：网页版（功能受限）

直接在浏览器访问：https://8081-idf2b3074077ybpvbjl3s-089ebb62.us2.manus.computer

⚠️ 注意：网页版相机功能受限

---

## 📚 文档导航

- **用户文档**
  - [用户快速开始](USER_QUICK_START.md) - 5分钟快速上手
  - [iOS 测试指南](IOS_TESTING_GUIDE.md) - 详细测试步骤
  
- **开发文档**
  - [快速启动指南](QUICK_START.md) - 开发环境设置
  - [项目状态](PROJECT_STATUS.md) - 完整项目状态
  - [会话总结](SESSION_SUMMARY.md) - 最新开发记录
  
- **部署文档**
  - [Railway 部署步骤](RAILWAY_DEPLOY_STEPS.md)
  - [永久部署完成](PERMANENT_DEPLOYMENT_COMPLETE.md)
  - [移动端测试指南](MOBILE_TEST_GUIDE.md)

---

## 🎯 项目状态

- **完成度**: 90%
- **后端状态**: ✅ Railway 永久部署运行中
- **前端状态**: ✅ EAS Update 已发布
- **测试状态**: ✅ 可以在 iPhone 上测试

---

## 🔗 重要链接

- **后端 API**: https://web-production-e22eb.up.railway.app
- **GitHub 仓库**: https://github.com/panshine6/fashion-accessories-inventory
- **Railway 项目**: perceptive-integrity
- **EAS 项目**: 0f415cb3-1cf9-4d4f-9a3e-dede63dd2193

---

## 🔐 安全提醒

**重要**：如果您是项目所有者，请立即修改 Expo 账户密码！

访问 https://expo.dev 登录后在 Settings > Security 中修改密码。

---

## ✨ 核心功能

- ✅ 用户认证（PIN 码登录）
- ✅ 产品管理（添加、查看）
- ✅ 相机拍照（细节照 + 全景照）
- ✅ AI 自动识别数量（OpenAI GPT-4 Vision）
- ✅ 云端同步（Railway MySQL）
- ✅ 多用户支持
- ⏳ 产品编辑/删除（待开发）
- ⏳ 搜索和筛选（待开发）
- ⏳ 数据统计（待开发）

---

## 🛠️ 技术栈

**前端**
- React Native
- Expo SDK 54
- Expo Router 6
- TypeScript
- tRPC Client

**后端**
- Node.js 22
- Express
- tRPC Server
- MySQL (Railway)

**AI**
- OpenAI GPT-4 Vision API

**部署**
- Railway (后端)
- EAS Update (前端 OTA)
- Expo Go (测试)

---

## 📞 获取帮助

- 查看 [iOS 测试指南](IOS_TESTING_GUIDE.md) 了解详细步骤
- 查看 [项目状态](PROJECT_STATUS.md) 了解完整信息
- 提交 GitHub Issue 报告问题
- 访问 https://help.manus.im 获取支持

---

**最后更新**: 2025年12月28日
