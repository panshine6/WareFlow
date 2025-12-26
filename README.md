# 时尚饰品入库助手

<div align="center">
  <img src="assets/images/icon.png" alt="App Icon" width="120" height="120" />
  <p><strong>基于 AI 的智能入库管理应用</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Expo-54.0-blue" alt="Expo" />
    <img src="https://img.shields.io/badge/React%20Native-0.81-blue" alt="React Native" />
    <img src="https://img.shields.io/badge/TypeScript-5.9-blue" alt="TypeScript" />
    <img src="https://img.shields.io/badge/OpenAI-Vision%20API-green" alt="OpenAI" />
  </p>
</div>

## 📱 应用简介

时尚饰品入库助手是一款专为仓库管理员设计的移动端应用，通过 AI 图像识别技术，实现快速、准确的产品入库管理。应用支持微距拍照、自动计数、智能查重、历史记录追踪等功能，大幅提升入库效率。

### ✨ 核心功能

#### 🎯 智能入库流程
- **微距拍照**：自动启用微距模式，清晰捕捉产品细节
- **SKU 管理**：智能记忆上次输入，快速录入产品编号
- **AI 计数**：基于 OpenAI Vision API，自动识别产品数量
- **位置记录**：支持默认位置，快速完成入库

#### 🔍 AI 辅助查重
- **图像相似度对比**：自动检测疑似重复产品
- **智能合并**：支持将新入库合并到现有款式
- **历史记录**：完整追踪每次入库的详细信息

#### 📦 库存管理
- **实时搜索**：按 SKU 快速查找产品
- **详情查看**：展示产品照片、数量、位置、操作员等信息
- **编辑功能**：支持修改 SKU、数量、存储位置
- **软删除**：误删除可恢复，90 天自动清理

#### 📊 数据导出
- **店小秘格式**：一键导出为店小秘批量上传模板
- **图片嵌入**：Excel 中自动嵌入产品照片
- **批量导出**：支持导出全部或筛选后的产品

#### 👥 用户管理
- **Manus OAuth 登录**：安全便捷的认证方式
- **操作员记录**：每次入库自动记录操作人信息
- **权限管理**：支持多用户协作

## 🚀 快速开始

### 环境要求

- Node.js 22.x
- pnpm 9.x
- Expo Go 应用（iOS/Android）

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/panshine6/fashion-accessories-inventory.git
cd fashion-accessories-inventory

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 OpenAI API Key

# 启动开发服务器
pnpm dev
```

### 配置环境变量

在 `.env.local` 文件中配置以下变量：

```bash
# OpenAI API Key（必需）
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...

# 数据库连接（可选，不配置则使用本地存储）
DATABASE_URL=mysql://user:password@host:port/database
```

### 在手机上测试

1. 在手机上安装 **Expo Go** 应用
2. 运行 `pnpm qr` 生成二维码
3. 使用 Expo Go 扫描二维码
4. 等待应用加载完成

## 📂 项目结构

```
fashion-accessories-inventory/
├── app/                      # 页面路由（Expo Router）
│   ├── (tabs)/              # Tab 导航页面
│   │   ├── index.tsx        # 主屏幕
│   │   └── inventory.tsx    # 库存列表
│   ├── add-product*.tsx     # 入库流程页面
│   ├── duplicate-check.tsx  # 查重页面
│   ├── product-detail.tsx   # 产品详情
│   ├── recycle-bin.tsx      # 回收站
│   └── feedback.tsx         # 反馈页面
├── lib/                     # 核心业务逻辑
│   ├── ai-vision.ts        # AI 图像识别
│   ├── storage.ts          # 本地数据存储
│   ├── excel-export.ts     # Excel 导出
│   ├── auth.ts             # 用户认证
│   └── trpc.ts             # API 客户端
├── server/                  # 后端 API（tRPC）
│   ├── routers.ts          # API 路由定义
│   ├── db.ts               # 数据库连接
│   └── storage.ts          # 云端存储逻辑
├── components/              # 可复用 UI 组件
├── hooks/                   # 自定义 React Hooks
├── types/                   # TypeScript 类型定义
├── drizzle/                 # 数据库 Schema
└── __tests__/              # 单元测试
```

## 🛠️ 技术栈

### 前端
- **Expo 54**：跨平台移动应用框架
- **React Native 0.81**：原生移动应用开发
- **TypeScript 5.9**：类型安全的 JavaScript
- **Expo Router 6**：基于文件的路由系统
- **TanStack React Query 5**：数据获取和状态管理

### 后端
- **tRPC 11**：端到端类型安全的 API
- **Express 4**：Node.js Web 框架
- **Drizzle ORM**：类型安全的 ORM
- **MySQL/TiDB**：关系型数据库

### AI 服务
- **OpenAI Vision API**：图像识别和相似度对比
- **GPT-4.1 Vision**：高精度物体计数

### 工具链
- **pnpm**：快速、节省磁盘空间的包管理器
- **Vitest**：快速的单元测试框架
- **ESLint**：代码质量检查
- **Prettier**：代码格式化

## 📝 开发命令

```bash
# 开发
pnpm dev              # 启动开发服务器（后端 + Metro）
pnpm dev:server       # 仅启动后端服务器
pnpm dev:metro        # 仅启动 Metro bundler

# 测试
pnpm test             # 运行单元测试
pnpm check            # TypeScript 类型检查
pnpm lint             # 代码质量检查

# 构建
pnpm build            # 构建生产版本
pnpm start            # 启动生产服务器

# 数据库
pnpm db:push          # 推送数据库 Schema

# 工具
pnpm format           # 格式化代码
pnpm qr               # 生成 Expo Go 二维码
```

## 🧪 测试

项目包含完整的单元测试覆盖：

```bash
# 运行所有测试
pnpm test

# 测试覆盖
✅ AI 图像识别功能
✅ 图像相似度对比
✅ 产品存储功能
✅ Excel 导出功能
✅ 查重流程集成
```

当前测试通过率：**89%**（16/18 测试通过）

## 📄 文档

- [设计文档](design.md)：UI/UX 设计规范和用户流程
- [云端存储指南](云端存储使用指南.md)：数据库配置和 API 使用
- [项目交付文档](PROJECT_DELIVERY.md)：完整的项目状态和部署信息
- [任务清单](todo.md)：开发进度和剩余工作

## 🔒 隐私和安全

- **数据存储**：支持本地存储和云端数据库两种模式
- **用户认证**：使用 Manus OAuth 安全认证
- **API 密钥**：所有敏感信息通过环境变量配置
- **软删除**：误删除数据可恢复，90 天后自动清理

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

## 📞 支持

如有问题或建议，请通过以下方式联系：

- 应用内反馈功能
- GitHub Issues
- Manus 帮助中心：https://help.manus.im

## 📜 许可证

本项目为私有项目，版权所有 © 2024

---

<div align="center">
  <p>使用 ❤️ 和 AI 构建</p>
  <p>
    <a href="https://expo.dev">Expo</a> •
    <a href="https://reactnative.dev">React Native</a> •
    <a href="https://openai.com">OpenAI</a>
  </p>
</div>
