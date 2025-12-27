# iOS 测试指南 - 时尚配饰库存管理应用（已修复）

## 🎉 问题已修复！

之前的 HTTP 400 错误已经解决。问题是缺少 `channel-name` 参数，现在已经重新发布了正确配置的 EAS Update。

---

## 📱 方法一：使用 Expo Go（推荐 - 最简单）

### 步骤 1：安装 Expo Go
1. 在 iPhone 上打开 App Store
2. 搜索 "Expo Go"
3. 下载并安装 Expo Go 应用

### 步骤 2：扫描二维码或手动输入

#### ✅ 方式 A：扫描二维码（推荐）
1. 打开 Expo Go 应用
2. 点击 "Scan QR code"
3. 扫描新的二维码图片（已保存在 `/home/ubuntu/expo_qr_code_fixed.png`）

#### ✅ 方式 B：手动输入 URL（推荐）
1. 打开 Expo Go 应用
2. 在搜索框中输入：
   ```
   exp://u.expo.dev/update/0f415cb3-1cf9-4d4f-9a3e-dede63dd2193?channel-name=production
   ```
3. 点击进入

**重要**：新的 URL 包含了 `?channel-name=production` 参数，这是修复 400 错误的关键！

### 步骤 3：等待应用加载
- 首次加载可能需要 30-60 秒
- 应用会自动下载最新的 OTA 更新
- 加载完成后会看到登录界面

### 步骤 4：登录测试
使用测试账号：
- **PIN 码**: `123456`

---

## 🔧 修复说明

### 原始错误
```
HTTP response error 400: "channel-name": Required.
The headers "expo-runtime-version", "expo-channel-name", 
and "expo-platform" are required.
```

### 问题原因
EAS Update 需要指定一个 channel，之前的 URL 缺少 `channel-name` 参数。

### 解决方案
1. 重新发布 EAS Update 到 `production` channel
2. 在 URL 中添加 `?channel-name=production` 参数
3. 生成新的 QR 码

### 新的 Update 信息
- **Update Group ID**: e540516f-11d0-46e0-acab-fb95ac12ab3d
- **Android Update ID**: 748c69f5-a161-4455-968d-9184e8d33953
- **iOS Update ID**: 72488db2-8fea-4682-bd11-d88c8638ef8c
- **Channel**: production
- **Runtime Version**: 1.0.0

---

## 🌐 方法二：网页版（备选方案）

如果 Expo Go 仍然遇到问题，可以使用网页版测试（功能有限，无相机）：

**网页版 URL**: https://8081-idf2b3074077ybpvbjl3s-089ebb62.us2.manus.computer

在 iPhone Safari 浏览器中打开即可。

---

## ✅ 核心功能测试清单

### 1. 用户认证
- [ ] 输入 PIN 码 123456 能成功登录
- [ ] 登录后显示用户名

### 2. 产品列表
- [ ] 能看到已添加的产品列表
- [ ] 产品显示缩略图、SKU、数量、位置信息

### 3. 添加产品（需要相机权限）
- [ ] 点击"添加产品"按钮
- [ ] 允许相机权限
- [ ] 拍摄产品细节照片
- [ ] 输入 SKU 编号
- [ ] 拍摄全景照片
- [ ] AI 识别数量（会调用 OpenAI API）
- [ ] 确认数量
- [ ] 输入位置信息
- [ ] 产品成功添加到列表

### 4. 云同步
- [ ] 添加的产品会自动同步到云端
- [ ] 在网页版能看到同样的数据

### 5. 多用户管理
- [ ] 可以查看用户列表
- [ ] 可以添加新用户

---

## 🔧 故障排除

### 问题 1：仍然显示 400 错误
**解决方案**：
- 确保使用新的 URL（包含 `?channel-name=production`）
- 清除 Expo Go 缓存：在 Expo Go 中长按项目 → 删除 → 重新扫码
- 重启 Expo Go 应用

### 问题 2：应用加载很慢
**原因**：
- 首次加载需要下载所有资源（约 3.8 MB）
- 网络速度影响加载时间

**解决方案**：
- 确保 iPhone 连接到稳定的 WiFi
- 耐心等待 1-2 分钟

### 问题 3：相机无法使用
**解决方案**：
1. 检查 iPhone 设置
2. 进入 设置 > Expo Go
3. 确保相机权限已开启

### 问题 4：AI 识别失败
**可能原因**：
- OpenAI API 调用失败
- 照片质量不佳

**解决方案**：
- 确保照片清晰
- 确保网络连接正常
- 可以手动输入数量

---

## 📊 后端 API 信息

- **API URL**: https://web-production-e22eb.up.railway.app
- **部署平台**: Railway
- **数据库**: Railway MySQL
- **状态**: 24/7 永久运行

---

## 🔐 安全提醒

**重要**：建议立即修改 Expo 账户密码！

当前账户信息：
- 用户名: Panshine6
- 邮箱: panshine6@gmail.com
- 密码: kyrrom-zanviF-2tamfi

修改密码步骤：
1. 访问 https://expo.dev
2. 登录账户
3. 进入 Settings > Security
4. 修改密码

---

## 📝 技术架构

### 前端
- React Native + Expo SDK
- Expo Router (文件路由)
- TypeScript
- tRPC Client

### 后端
- Node.js + Express
- tRPC Server
- Railway MySQL 数据库

### AI 功能
- OpenAI GPT-4 Vision API
- 自动识别产品数量

---

## 🚀 下一步开发计划

当前完成度：**90%**

待完成功能：
1. [ ] 产品编辑功能
2. [ ] 产品删除功能
3. [ ] 库存统计报表
4. [ ] 导出数据功能
5. [ ] 批量操作功能
6. [ ] 搜索和筛选功能
7. [ ] 用户权限管理
8. [ ] 数据备份功能

---

## 📞 支持

如有问题，请查看：
- GitHub 仓库: https://github.com/panshine6/fashion-accessories-inventory
- Railway 项目: perceptive-integrity
- EAS 项目 ID: 0f415cb3-1cf9-4d4f-9a3e-dede63dd2193
- EAS Dashboard: https://expo.dev/accounts/panshine6/projects/fashion-accessories-inventory/updates/e540516f-11d0-46e0-acab-fb95ac12ab3d

---

## 📈 更新历史

### 2025-12-28 - 修复 400 错误
- ✅ 重新发布 EAS Update 到 production channel
- ✅ 添加 channel-name 参数到 URL
- ✅ 生成新的 QR 码
- ✅ 更新文档

### 2025-12-27
- ✅ Railway 后端首次部署
- ✅ EAS Update 首次发布

---

**最后更新**: 2025年12月28日  
**状态**: ✅ 已修复，可以正常使用
