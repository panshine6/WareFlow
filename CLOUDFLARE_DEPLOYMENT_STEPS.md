# 🚀 Cloudflare Pages 部署步骤

## 📋 准备工作

✅ 所有文件已准备完成：
- ✅ 静态文件已导出到 `dist` 目录
- ✅ 配置文件已创建（`.cloudflare/pages.json`）
- ✅ GitHub 仓库已更新
- ✅ 后端 API 已部署在 Railway

---

## 🎯 部署步骤（5分钟）

### 步骤 1：访问 Cloudflare Pages

1. 在浏览器中打开：**https://pages.cloudflare.com**
2. 点击右上角的 **"Sign up"** 或 **"Log in"**
3. 选择 **"Sign in with GitHub"**（使用 GitHub 账户登录）

---

### 步骤 2：授权 Cloudflare 访问 GitHub

1. 登录后，点击 **"Create a project"**
2. 选择 **"Connect to Git"**
3. 点击 **"GitHub"**
4. 在弹出窗口中，授权 Cloudflare Pages 访问您的 GitHub 账户
5. 选择 **"Only select repositories"**
6. 在下拉菜单中选择：**`panshine6/fashion-accessories-inventory`**
7. 点击 **"Install & Authorize"**

---

### 步骤 3：配置项目

返回 Cloudflare Pages 后，您会看到仓库列表：

1. 找到并点击 **`fashion-accessories-inventory`**
2. 点击 **"Begin setup"**

---

### 步骤 4：设置构建配置

在 "Set up builds and deployments" 页面：

#### 基本设置
```
Project name: fashion-accessories-inventory
Production branch: main
```

#### 构建设置
```
Framework preset: None (或选择 "Other")
Build command: npx expo export --platform web
Build output directory: dist
```

#### 环境变量
点击 **"Add variable"** 添加以下变量：

**变量 1**：
```
Variable name: EXPO_PUBLIC_API_BASE_URL
Value: https://web-production-e22eb.up.railway.app
```

**变量 2**（可选，如果需要）：
```
Variable name: NODE_VERSION
Value: 22
```

---

### 步骤 5：开始部署

1. 检查所有配置是否正确
2. 点击页面底部的 **"Save and Deploy"** 按钮
3. 等待构建完成（约 2-3 分钟）

---

## 📊 构建过程

您会看到构建日志，显示以下步骤：

1. ✅ Cloning repository
2. ✅ Installing dependencies
3. ✅ Building application
4. ✅ Deploying to Cloudflare's global network

---

## 🎉 部署完成

构建成功后，您会看到：

1. **部署 URL**：`https://fashion-accessories-inventory.pages.dev`
2. 或类似的 URL（可能包含随机字符）

---

## 🔗 获取您的 URL

部署完成后：

1. 在 Cloudflare Pages 项目页面
2. 您会看到 **"Visit site"** 按钮
3. 点击即可访问您的应用
4. URL 格式：`https://[project-name].pages.dev`

---

## ✅ 验证部署

访问您的 URL 后：

1. 应该看到登录界面
2. 使用 PIN 码 **`123456`** 登录
3. 测试功能：
   - ✅ 查看产品列表
   - ✅ 添加产品
   - ✅ 测试相机（HTTPS 环境下可用）
   - ✅ AI 识别数量
   - ✅ 云同步

---

## 🔧 如果遇到问题

### 构建失败

如果构建失败，检查：

1. **构建命令是否正确**：`npx expo export --platform web`
2. **输出目录是否正确**：`dist`
3. **环境变量是否设置**

### 页面无法访问

1. 等待几分钟（DNS 传播）
2. 清除浏览器缓存
3. 尝试无痕模式

### API 连接失败

确认环境变量 `EXPO_PUBLIC_API_BASE_URL` 设置正确：
```
https://web-production-e22eb.up.railway.app
```

---

## 🎨 自定义域名（可选）

如果您有自己的域名：

1. 在 Cloudflare Pages 项目中
2. 点击 **"Custom domains"**
3. 点击 **"Set up a custom domain"**
4. 输入您的域名
5. 按照说明配置 DNS

---

## 🔄 自动部署

配置完成后，每次您推送代码到 GitHub：

1. Cloudflare Pages 会自动检测
2. 自动构建新版本
3. 自动部署到生产环境
4. 无需手动操作

---

## 📱 在 iPhone 上测试

部署完成后：

1. 在 iPhone Safari 中打开您的 URL
2. 点击分享按钮
3. 选择 **"添加到主屏幕"**
4. 现在可以像原生应用一样使用

---

## 🎯 预期结果

部署成功后，您将获得：

- ✅ 永久的 HTTPS URL
- ✅ 全球 CDN 加速
- ✅ 自动 SSL 证书
- ✅ 无限带宽
- ✅ 完全免费
- ✅ 自动部署
- ✅ 相机功能可用（HTTPS 环境）

---

## 📞 需要帮助？

如果在部署过程中遇到任何问题：

1. 截图错误信息
2. 告诉我具体在哪一步遇到问题
3. 我会帮您解决

---

## 🔐 安全提醒

**重要**：部署完成后，建议：

1. 不要在前端代码中暴露 OpenAI API 密钥
2. 所有 API 调用应通过后端代理
3. 当前配置已经是安全的（API 密钥在后端）

---

## 📊 部署信息总结

| 项目 | 信息 |
|------|------|
| **平台** | Cloudflare Pages |
| **仓库** | panshine6/fashion-accessories-inventory |
| **分支** | main |
| **构建命令** | npx expo export --platform web |
| **输出目录** | dist |
| **后端 API** | https://web-production-e22eb.up.railway.app |
| **预期 URL** | https://fashion-accessories-inventory.pages.dev |
| **成本** | 完全免费 |

---

**准备好了吗？** 

现在请访问 https://pages.cloudflare.com 开始部署！

如果遇到任何问题，随时告诉我。我会实时帮您解决。

---

**最后更新**: 2025年12月28日  
**状态**: 准备部署  
**预计时间**: 5 分钟
