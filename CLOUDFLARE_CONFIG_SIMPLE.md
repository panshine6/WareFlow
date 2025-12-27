# 📝 Cloudflare Pages 配置填写指南

## 第一步：连接 GitHub 仓库

1. 在 Cloudflare Pages 页面，点击 **"Connect to Git"**
2. 选择 **"GitHub"**
3. 如果需要授权，点击 **"Install & Authorize"**
4. 选择仓库：**`panshine6/fashion-accessories-inventory`**
5. 点击 **"Begin setup"**

---

## 第二步：填写项目配置

### 基本信息

**Project name（项目名称）**：
```
fashion-accessories-inventory
```

**Production branch（生产分支）**：
```
main
```

---

### 构建设置

**Framework preset（框架预设）**：
```
None
```
（或者选择 "Other"）

**Build command（构建命令）**：
```
npx expo export --platform web
```

**Build output directory（构建输出目录）**：
```
dist
```

---

### 环境变量

点击 **"Add variable"** 按钮，添加以下变量：

**变量名**：
```
EXPO_PUBLIC_API_BASE_URL
```

**值**：
```
https://web-production-e22eb.up.railway.app
```

---

## 第三步：部署

点击页面底部的 **"Save and Deploy"** 按钮

---

## 完成！

等待 2-3 分钟，构建完成后您会获得一个 URL，类似：
```
https://fashion-accessories-inventory.pages.dev
```

---

## 📋 配置总结（复制粘贴用）

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

完成后告诉我 URL，我帮您验证！
