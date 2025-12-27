# 🔧 Cloudflare Pages 部署修复指南

## 问题诊断

错误信息：`Missing entry-point to Worker script or to assets directory`

**根本原因**：Cloudflare Pages 无法识别 Expo Web 导出的目录结构。

---

## ✅ 解决方案

### 方案 1：修改构建配置（推荐）

在 Cloudflare Pages 设置中，将构建命令改为：

```bash
pnpm install && npx expo export --platform web && cp -r dist/* . && rm -rf dist
```

**构建输出目录**：
```
.
```

这样会将 dist 目录的内容复制到根目录，Cloudflare Pages 就能找到 index.html 了。

---

### 方案 2：使用 Functions 配置

在 Cloudflare Pages 设置中：

**构建命令**：
```bash
npx expo export --platform web
```

**构建输出目录**：
```
dist
```

**然后添加 Functions 配置**：

创建 `functions/_middleware.ts` 文件（我已经为您准备好了）

---

### 方案 3：使用 wrangler.toml（最简单）

我已经创建了 `wrangler.toml` 配置文件，它会告诉 Cloudflare Pages 正确的目录结构。

**构建命令**：
```bash
npx expo export --platform web
```

**构建输出目录**：
```
dist
```

---

## 🎯 推荐操作步骤

### 立即尝试（最简单）

1. 在 Cloudflare Pages 项目设置中
2. 找到 "Build configuration"
3. 修改 **Build output directory** 为：
   ```
   dist
   ```
4. 点击 "Save"
5. 点击 "Retry deployment"

---

## 📝 完整配置（确保正确）

```
项目名称: fashion-accessories-inventory
生产分支: main
框架预设: None
构建命令: npx expo export --platform web
输出目录: dist

环境变量:
EXPO_PUBLIC_API_BASE_URL=https://web-production-e22eb.up.railway.app
```

---

## 🔍 验证步骤

部署成功后，检查：
1. 访问 URL 能看到登录页面
2. 输入 PIN 码 123456 能登录
3. 能看到产品列表
4. 相机功能可用（HTTPS 环境）

---

## 💡 如果还是失败

请截图发给我：
1. Build log 的完整错误信息
2. Build settings 的配置截图

我会进一步帮您诊断！
