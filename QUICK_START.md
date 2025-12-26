# 快速启动指南

## 🎯 5 分钟快速开始

### 第一步：确认环境

确保您的开发环境已经准备就绪：

```bash
# 检查 Node.js 版本（需要 22.x）
node --version

# 检查 pnpm 版本（需要 9.x）
pnpm --version
```

### 第二步：安装依赖

```bash
# 在项目根目录执行
pnpm install
```

### 第三步：配置环境变量

创建 `.env.local` 文件并配置 OpenAI API Key：

```bash
# 复制示例文件
cp .env.example .env.local

# 编辑文件，添加您的 API Key
# EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...
```

### 第四步：启动开发服务器

```bash
# 启动完整的开发环境（后端 + 前端）
pnpm dev
```

等待服务器启动，您会看到：
```
✅ 后端 API 服务器：http://localhost:3001
✅ Expo Metro 服务器：http://localhost:8082
```

### 第五步：在手机上测试

#### 方式 1：使用 Expo Go（推荐）

1. **下载 Expo Go**
   - iOS：App Store 搜索 "Expo Go"
   - Android：Google Play 搜索 "Expo Go"

2. **生成二维码**
   ```bash
   pnpm qr "exp://YOUR_IP:8082"
   ```
   将 `YOUR_IP` 替换为您的电脑 IP 地址

3. **扫码测试**
   - 打开 Expo Go
   - 点击 "Scan QR Code"
   - 扫描生成的二维码

#### 方式 2：Web 浏览器测试

直接在浏览器中访问：
```
http://localhost:8082
```

⚠️ **注意**：Web 版本的相机功能受限，建议使用手机测试。

## 🔧 常见问题

### Q1: 端口被占用怎么办？

```bash
# 杀死占用端口的进程
pkill -f expo
pkill -f node

# 或者指定其他端口
EXPO_PORT=8083 pnpm dev
```

### Q2: 找不到 OpenAI API Key？

1. 访问 https://platform.openai.com/api-keys
2. 创建新的 API Key
3. 复制并粘贴到 `.env.local` 文件

### Q3: 手机无法连接到开发服务器？

确保：
- 手机和电脑在同一 Wi-Fi 网络
- 防火墙允许端口 8082
- 使用正确的 IP 地址（不是 localhost）

### Q4: 如何查看日志？

```bash
# 查看后端日志
tail -f /tmp/server.log

# 查看 Expo 日志
tail -f /tmp/expo.log
```

## 📱 测试核心功能

### 1. 测试入库流程

1. 点击主屏幕的"添加产品"按钮
2. 拍摄产品细节照片
3. 输入 SKU 编号（例如：TEST-001）
4. 拍摄产品全景照片
5. 确认 AI 识别的数量
6. 输入存储位置（例如：A1-01）
7. 完成入库

### 2. 测试查重功能

1. 再次添加产品，使用相同的细节照片
2. 系统会自动检测到相似产品
3. 选择"合并到现有款式"或"确认为新款"

### 3. 测试库存管理

1. 切换到"库存"Tab
2. 在搜索框输入 SKU
3. 点击产品查看详情
4. 测试编辑和删除功能

### 4. 测试 Excel 导出

1. 在库存页面点击"导出"按钮
2. 选择分享方式
3. 打开导出的 Excel 文件
4. 验证产品信息和图片显示

## 🚀 下一步

### 创建 GitHub 仓库

```bash
# 运行自动化脚本
./create-github-repo.sh
```

### 配置云端数据库（可选）

如需团队协作：

1. 获取 MySQL/TiDB 数据库连接 URL
2. 在 `.env.local` 中添加：
   ```bash
   DATABASE_URL=mysql://user:password@host:port/database
   ```
3. 初始化数据库：
   ```bash
   pnpm db:push
   ```

### 准备发布

1. 更新应用版本号（`app.config.ts`）
2. 准备应用截图和描述
3. 构建生产版本：
   ```bash
   pnpm build
   ```

## 📞 需要帮助？

- 查看 [完整文档](README.md)
- 查看 [项目交付文档](PROJECT_DELIVERY.md)
- 使用应用内反馈功能
- 访问 https://help.manus.im

---

**祝您使用愉快！** 🎉
