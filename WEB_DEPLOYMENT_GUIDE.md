# 🌐 Web 前端永久部署指南

## 📋 概述

本指南提供多种方式将 Expo Web 前端永久部署到云平台。

---

## ✅ 方案 1：Cloudflare Pages（推荐）

### 优势
- ✅ 完全免费
- ✅ 全球 CDN 加速
- ✅ 自动 HTTPS
- ✅ 与 GitHub 集成
- ✅ 无限带宽

### 部署步骤

1. **访问 Cloudflare Pages**
   - 打开 https://pages.cloudflare.com
   - 使用 GitHub 账户登录

2. **创建新项目**
   - 点击 "Create a project"
   - 选择 GitHub 仓库：`panshine6/fashion-accessories-inventory`
   - 授权 Cloudflare 访问仓库

3. **配置构建设置**
   ```
   项目名称: fashion-accessories-inventory
   生产分支: main
   构建命令: npx expo export --platform web
   构建输出目录: dist
   ```

4. **添加环境变量**
   ```
   EXPO_PUBLIC_API_BASE_URL=https://web-production-e22eb.up.railway.app
   EXPO_PUBLIC_OPENAI_API_KEY=sk-kKYFXPGeWEBxYyxPGhEahs
   ```

5. **部署**
   - 点击 "Save and Deploy"
   - 等待构建完成（约 2-3 分钟）
   - 获取部署 URL（格式：`https://fashion-accessories-inventory.pages.dev`）

---

## ✅ 方案 2：Vercel（推荐）

### 优势
- ✅ 完全免费
- ✅ 自动部署
- ✅ 全球 CDN
- ✅ 自定义域名

### 部署步骤

1. **访问 Vercel**
   - 打开 https://vercel.com
   - 使用 GitHub 账户登录

2. **导入项目**
   - 点击 "New Project"
   - 选择 `panshine6/fashion-accessories-inventory`

3. **配置项目**
   ```
   Framework Preset: Other
   Build Command: npx expo export --platform web
   Output Directory: dist
   Install Command: pnpm install
   ```

4. **添加环境变量**
   ```
   EXPO_PUBLIC_API_BASE_URL=https://web-production-e22eb.up.railway.app
   EXPO_PUBLIC_OPENAI_API_KEY=sk-kKYFXPGeWEBxYyxPGhEahs
   ```

5. **部署**
   - 点击 "Deploy"
   - 等待构建完成
   - 获取部署 URL（格式：`https://fashion-accessories-inventory.vercel.app`）

---

## ✅ 方案 3：Netlify

### 优势
- ✅ 免费套餐
- ✅ 拖放部署
- ✅ 表单处理
- ✅ 函数支持

### 部署步骤

1. **访问 Netlify**
   - 打开 https://netlify.com
   - 使用 GitHub 账户登录

2. **导入项目**
   - 点击 "New site from Git"
   - 选择 GitHub
   - 选择 `panshine6/fashion-accessories-inventory`

3. **配置构建**
   ```
   Build command: npx expo export --platform web
   Publish directory: dist
   ```

4. **添加环境变量**
   - 在 Site settings > Build & deploy > Environment
   - 添加：
     - `EXPO_PUBLIC_API_BASE_URL`
     - `EXPO_PUBLIC_OPENAI_API_KEY`

5. **部署**
   - 点击 "Deploy site"
   - 获取 URL（格式：`https://[random-name].netlify.app`）

---

## ✅ 方案 4：GitHub Pages

### 优势
- ✅ 完全免费
- ✅ 与 GitHub 深度集成
- ✅ 自定义域名支持

### 部署步骤

1. **启用 GitHub Pages**
   - 访问 https://github.com/panshine6/fashion-accessories-inventory/settings/pages
   - Source: 选择 "GitHub Actions"

2. **手动触发工作流**
   - 由于权限限制，需要手动创建工作流文件
   - 或者使用 GitHub Web 界面创建

3. **访问网站**
   - URL: `https://panshine6.github.io/fashion-accessories-inventory/`

---

## ✅ 方案 5：Railway（与后端同平台）

### 优势
- ✅ 与后端在同一平台
- ✅ 统一管理
- ✅ 简单配置

### 部署步骤

1. **在 Railway 项目中添加新服务**
   ```bash
   railway service create web-frontend
   ```

2. **配置服务**
   - 使用 `Dockerfile.web`
   - 或使用 Nixpacks 自动检测

3. **设置环境变量**
   ```
   EXPO_PUBLIC_API_BASE_URL=https://web-production-e22eb.up.railway.app
   ```

4. **部署**
   ```bash
   railway up
   ```

---

## 📦 已准备的文件

### 1. vercel.json
用于 Vercel 部署的配置文件

### 2. Dockerfile.web
用于容器化部署的 Docker 配置

### 3. dist/
已导出的静态文件，可以直接部署

---

## 🚀 快速部署（推荐流程）

### 最简单的方法：Cloudflare Pages

1. 访问 https://pages.cloudflare.com
2. 连接 GitHub 仓库
3. 设置构建命令：`npx expo export --platform web`
4. 设置输出目录：`dist`
5. 添加环境变量
6. 点击部署

**预计时间**: 5 分钟

---

## 🔧 本地测试

在部署前，可以本地测试：

```bash
# 导出 Web 版本
npx expo export --platform web

# 使用 serve 测试
npx serve dist

# 访问 http://localhost:3000
```

---

## 🌍 部署后的 URL

部署成功后，您将获得一个永久 URL，例如：

- **Cloudflare Pages**: `https://fashion-accessories-inventory.pages.dev`
- **Vercel**: `https://fashion-accessories-inventory.vercel.app`
- **Netlify**: `https://fashion-accessories-inventory.netlify.app`
- **GitHub Pages**: `https://panshine6.github.io/fashion-accessories-inventory/`

---

## 📱 与 Expo Go 的区别

| 特性 | Web 部署 | Expo Go |
|------|---------|---------|
| 访问方式 | 浏览器 URL | 扫码或输入 exp:// URL |
| 相机功能 | 受限（需要 HTTPS） | 完整支持 |
| 原生功能 | 部分支持 | 完整支持 |
| 部署成本 | 免费 | 免费 |
| 访问便捷性 | ✅ 任何设备浏览器 | ⚠️ 需要安装 Expo Go |
| 性能 | Web 性能 | 原生性能 |
| 适用场景 | 展示、轻度使用 | 完整功能测试 |

---

## 🔐 安全注意事项

### 环境变量
- ✅ `EXPO_PUBLIC_API_BASE_URL` - 可以公开
- ⚠️ `EXPO_PUBLIC_OPENAI_API_KEY` - 建议通过后端代理

### 建议
将 OpenAI API 调用移到后端，避免在前端暴露 API 密钥。

---

## 📊 部署对比

| 平台 | 免费额度 | 构建时间 | CDN | 自定义域名 | 难度 |
|------|---------|---------|-----|-----------|------|
| **Cloudflare Pages** | 无限 | 2-3分钟 | ✅ 全球 | ✅ 免费 | ⭐ 简单 |
| **Vercel** | 100GB/月 | 2-3分钟 | ✅ 全球 | ✅ 免费 | ⭐ 简单 |
| **Netlify** | 100GB/月 | 3-4分钟 | ✅ 全球 | ✅ 免费 | ⭐ 简单 |
| **GitHub Pages** | 100GB/月 | 5-10分钟 | ✅ GitHub | ✅ 免费 | ⭐⭐ 中等 |
| **Railway** | 5$/月免费 | 3-5分钟 | ❌ 单区域 | ✅ 免费 | ⭐⭐ 中等 |

---

## 🎯 推荐方案

根据不同需求：

1. **最快部署**: Cloudflare Pages 或 Vercel
2. **最佳性能**: Cloudflare Pages（全球 CDN）
3. **统一管理**: Railway（与后端同平台）
4. **最简单**: Vercel（一键部署）

---

## 📞 获取帮助

如果部署遇到问题：

1. 检查构建日志
2. 确认环境变量正确
3. 验证 dist 目录已生成
4. 测试本地 serve

---

## 📝 更新部署

所有平台都支持自动部署：

1. 推送代码到 GitHub
2. 平台自动检测更改
3. 自动构建和部署
4. 几分钟后生效

---

**最后更新**: 2025年12月28日  
**状态**: 静态文件已导出，准备部署  
**推荐平台**: Cloudflare Pages 或 Vercel
