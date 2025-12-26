# Railway 部署指南

## 问题分析

### 为什么会出现 502 错误？

1. **Sandbox 临时性**
   - Sandbox 环境是临时的，重启后进程会被清理
   - 临时域名可能会失效或变更
   - 不适合作为生产环境使用

2. **网络限制**
   - Expo Go 在 iOS 上可能无法访问某些临时域名
   - SSL 证书验证问题
   - 跨域和安全策略限制

3. **进程管理**
   - 开发服务器可能因为错误而崩溃
   - 没有自动重启机制
   - 资源限制导致进程被杀死

### 如何避免再次发生？

**唯一可靠的解决方案：部署到生产环境**

---

## Railway 部署步骤

### 方式 1：使用 Railway CLI（推荐）

#### 1. 登录 Railway

```bash
railway login
```

这会打开浏览器，完成 GitHub 授权。

#### 2. 初始化项目

```bash
cd /home/ubuntu/fashion-accessories-inventory
railway init
```

选择 "Create new project"，输入项目名称（如 `fashion-inventory-api`）。

#### 3. 添加 PostgreSQL 数据库

```bash
railway add --database postgresql
```

或者继续使用现有的 Railway MySQL 数据库。

#### 4. 设置环境变量

```bash
# 设置数据库连接
railway variables set DATABASE_URL="mysql://root:DYjNhOcmYxDZUPfvqECJTjuqjKZPkRfp@autorack.proxy.rlwy.net:22819/railway"

# 设置 OpenAI API Key
railway variables set OPENAI_API_KEY="$OPENAI_API_KEY"

# 设置 Node 环境
railway variables set NODE_ENV="production"
```

#### 5. 部署

```bash
railway up
```

#### 6. 获取部署 URL

```bash
railway domain
```

这会生成一个永久的公网域名，如：`fashion-inventory-api.up.railway.app`

---

### 方式 2：使用 GitHub 集成（自动部署）

#### 1. 推送代码到 GitHub

代码已经在 GitHub 上：
```
https://github.com/panshine6/fashion-accessories-inventory
```

#### 2. 在 Railway 网站上操作

1. 访问 [railway.app](https://railway.app)
2. 点击 "New Project"
3. 选择 "Deploy from GitHub repo"
4. 选择 `panshine6/fashion-accessories-inventory` 仓库
5. Railway 会自动检测并部署

#### 3. 配置环境变量

在 Railway 项目设置中添加：

```
DATABASE_URL=mysql://root:DYjNhOcmYxDZUPfvqECJTjuqjKZPkRfp@autorack.proxy.rlwy.net:22819/railway
OPENAI_API_KEY=<your_openai_key>
NODE_ENV=production
PORT=3000
```

#### 4. 添加自定义域名（可选）

在 Settings → Domains 中可以添加自定义域名。

---

## 部署后配置

### 1. 更新应用的 API 地址

编辑 `.env.local` 文件：

```bash
# 使用 Railway 的永久域名
EXPO_PUBLIC_API_BASE_URL=https://your-app.up.railway.app
```

### 2. 重新构建应用

```bash
cd /home/ubuntu/fashion-accessories-inventory
npx expo export --platform ios --output-dir dist-expo
```

### 3. 生成新的二维码

```bash
node generate-share-qr.mjs
```

---

## Railway 优势

### ✅ 永久运行
- 24/7 在线
- 不会因为 sandbox 重启而停止
- 自动重启失败的服务

### ✅ 自动扩展
- 根据流量自动扩展
- 高可用性
- 负载均衡

### ✅ 免费套餐
- 每月 $5 免费额度
- 足够小型应用使用
- 超出后按使用付费

### ✅ CI/CD
- GitHub 集成
- 自动部署
- 回滚支持

### ✅ 监控和日志
- 实时日志查看
- 性能监控
- 错误追踪

---

## 故障排查

### 部署失败

1. 检查 `package.json` 中的 `build` 和 `start` 脚本
2. 确保 `Procfile` 正确
3. 查看 Railway 部署日志

### 数据库连接失败

1. 检查 `DATABASE_URL` 环境变量
2. 确保数据库服务正在运行
3. 检查防火墙规则

### API 无法访问

1. 检查域名是否正确配置
2. 确保端口设置正确（Railway 会自动分配）
3. 查看服务器日志

---

## 成本估算

### 免费套餐限制

- **执行时间**：每月 500 小时（约 20 天）
- **内存**：512MB
- **带宽**：100GB/月

### 对于本应用

- **预计使用**：24/7 运行 = 720 小时/月
- **超出费用**：约 $5-10/月
- **总成本**：约 $5-10/月（包含免费额度）

---

## 下一步

1. **立即部署**：选择上述任一方式部署到 Railway
2. **更新配置**：将应用指向新的 Railway API 地址
3. **测试验证**：确保所有功能正常工作
4. **删除临时环境**：不再依赖 sandbox 临时链接

---

**需要帮助？** 我可以协助您完成 Railway 部署的每一步！
