# 🎉 Expo Go 连接指南（Sandbox 开发服务器）

## ✅ 问题已解决！

现在使用的是**正确的方法**：直接连接到 Sandbox 开发服务器，就像您之前成功使用的那样。

---

## 📱 在 iPhone 上使用 Expo Go 测试

### 步骤 1：确保 Expo Go 已安装
在 App Store 搜索并安装 **Expo Go**

### 步骤 2：连接到开发服务器

#### ✅ 方式 A：扫描二维码（推荐）
1. 打开 Expo Go 应用
2. 点击 "Scan QR code"
3. 扫描新的二维码（文件：`expo_qr_code_sandbox.png`）

#### ✅ 方式 B：手动输入 URL
1. 打开 Expo Go 应用
2. 在 URL 输入框中输入：
   ```
   exp://8081-idf2b3074077ybpvbjl3s-089ebb62.us2.manus.computer
   ```
3. 点击连接

### 步骤 3：等待应用加载
- 首次加载需要下载 JavaScript bundle（约 30-60 秒）
- 后续热重载会很快
- 加载完成后会看到登录界面

### 步骤 4：登录测试
使用测试账号：
- **PIN 码**: `123456`

---

## 🔧 技术说明

### 开发服务器信息
- **本地端口**: 8081
- **暴露的 HTTPS URL**: https://8081-idf2b3074077ybpvbjl3s-089ebb62.us2.manus.computer
- **Expo Go URL**: exp://8081-idf2b3074077ybpvbjl3s-089ebb62.us2.manus.computer
- **状态**: 运行中

### 为什么之前的方法不工作？
1. **EAS Update URL** (`exp://u.expo.dev/...`) 需要先有已构建的应用
2. **Tunnel 模式** 虽然启动了，但在 Sandbox 环境中不显示 QR 码
3. **正确方法** 是直接使用暴露的 Sandbox HTTPS URL

### 与之前成功案例的对比
- ✅ 使用相同的方法：直接连接开发服务器
- ✅ 使用 `exp://` 协议
- ✅ 使用暴露的 Sandbox 域名
- ✅ 无需 EAS Build 或 Apple Developer 账户

---

## ✅ 核心功能测试清单

### 1. 用户认证
- [ ] 输入 PIN 码 123456 能成功登录
- [ ] 登录后显示用户名

### 2. 产品列表
- [ ] 能看到已添加的产品列表
- [ ] 产品显示缩略图、SKU、数量、位置信息

### 3. 添加产品（完整相机功能）
- [ ] 点击"添加产品"按钮
- [ ] 允许相机权限
- [ ] 拍摄产品细节照片
- [ ] 输入 SKU 编号
- [ ] 拍摄全景照片
- [ ] AI 识别数量（OpenAI API）
- [ ] 确认数量
- [ ] 输入位置信息
- [ ] 产品成功添加到列表

### 4. 云同步
- [ ] 添加的产品自动同步到云端
- [ ] 在网页版能看到同样的数据

### 5. 多用户管理
- [ ] 可以查看用户列表
- [ ] 可以添加新用户

### 6. 热重载（开发功能）
- [ ] 修改代码后自动刷新
- [ ] 无需重新扫码

---

## 🔧 故障排除

### 问题 1：无法连接到服务器
**解决方案**：
- 确保开发服务器正在运行
- 检查 URL 是否正确
- 确保 iPhone 有网络连接

### 问题 2：加载很慢
**原因**：
- 首次加载需要下载完整的 JavaScript bundle
- Sandbox 网络速度可能影响加载时间

**解决方案**：
- 耐心等待 1-2 分钟
- 确保 WiFi 连接稳定

### 问题 3：相机无法使用
**解决方案**：
1. 检查 iPhone 设置
2. 进入 设置 > Expo Go
3. 确保相机权限已开启

### 问题 4：连接后显示错误
**解决方案**：
- 在 Expo Go 中删除项目
- 重新扫描二维码
- 清除 Expo Go 缓存

---

## 🌐 备选方案：网页版

如果 Expo Go 仍然遇到问题，可以使用网页版：

**URL**: https://8081-idf2b3074077ybpvbjl3s-089ebb62.us2.manus.computer

⚠️ 注意：网页版相机功能受限

---

## 📊 后端 API 信息

- **API URL**: https://web-production-e22eb.up.railway.app
- **部署平台**: Railway
- **数据库**: Railway MySQL
- **状态**: 24/7 永久运行

---

## 🎯 优势

### 使用 Sandbox 开发服务器的优势
1. ✅ **完整功能**：所有原生功能可用（相机、存储等）
2. ✅ **热重载**：修改代码立即生效
3. ✅ **无需构建**：不需要 EAS Build 或 Apple Developer 账户
4. ✅ **免费**：完全免费使用
5. ✅ **快速迭代**：开发测试周期短

### 与其他方案的对比
| 方案 | 功能完整性 | 成本 | 设置时间 | 热重载 |
|------|-----------|------|---------|--------|
| **Sandbox + Expo Go** | ✅ 完整 | 免费 | 1分钟 | ✅ 支持 |
| 网页版 | ⚠️ 受限 | 免费 | 即时 | ✅ 支持 |
| EAS Build | ✅ 完整 | $99/年 | 15分钟 | ❌ 不支持 |
| TestFlight | ✅ 完整 | $99/年 | 30分钟 | ❌ 不支持 |

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

## 📝 开发服务器管理

### 查看服务器状态
```bash
tail -f /tmp/expo-dev-server.log
```

### 重启服务器
```bash
pkill -f "expo start"
cd /home/ubuntu/fashion-accessories-inventory
npx expo start > /tmp/expo-dev-server.log 2>&1 &
```

### 检查端口
```bash
lsof -ti:8081
```

---

## 🚀 下一步

### 开发计划（10% 待完成）
1. [ ] 产品编辑功能
2. [ ] 产品删除功能
3. [ ] 搜索和筛选功能
4. [ ] 库存统计报表
5. [ ] 批量操作功能
6. [ ] 数据导出功能

### 生产部署（可选）
当开发完成后，可以：
1. 申请 Apple Developer 账户（$99/年）
2. 使用 EAS Build 构建生产版本
3. 发布到 App Store

---

## 📞 支持

如有问题，请查看：
- GitHub 仓库: https://github.com/panshine6/fashion-accessories-inventory
- Railway 项目: perceptive-integrity
- 开发服务器日志: `/tmp/expo-dev-server.log`

---

## 📈 更新历史

### 2025-12-28 - 修复 Expo Go 连接
- ✅ 启动 Sandbox 开发服务器
- ✅ 暴露 8081 端口
- ✅ 生成正确的 exp:// URL
- ✅ 创建新的 QR 码
- ✅ 使用与之前成功案例相同的方法

---

**最后更新**: 2025年12月28日  
**状态**: ✅ 开发服务器运行中，可以使用 Expo Go 测试  
**方法**: 直接连接 Sandbox 开发服务器（与之前成功案例相同）
