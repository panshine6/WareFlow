# Railway 部署步骤指南

## 🎯 目标
将后端 API 部署到 Railway，获得永久稳定的服务地址。

---

## 📋 第一步：在 Railway 网站上创建项目

### 1. 访问 Railway 网站

打开浏览器，访问：**https://railway.app**

### 2. 登录账号

- 点击右上角 **"Login"** 按钮
- 选择 **"Login with GitHub"**
- 授权 Railway 访问您的 GitHub 账号
- 完成登录

### 3. 创建新项目

1. 登录后，点击 **"New Project"** 按钮
2. 在弹出的菜单中，选择 **"Deploy from GitHub repo"**
3. 如果是第一次使用，需要授权 Railway 访问 GitHub 仓库：
   - 点击 **"Configure GitHub App"**
   - 选择授权 **"All repositories"** 或仅授权 **"panshine6/fashion-accessories-inventory"**
   - 点击 **"Install & Authorize"**

4. 返回 Railway，在仓库列表中找到并选择：
   ```
   panshine6/fashion-accessories-inventory
   ```

5. Railway 会自动开始部署，但**会失败**（因为还没有配置环境变量）

---

## 📋 第二步：配置环境变量

### 1. 进入项目设置

- 在 Railway 项目页面，点击项目名称
- 点击右上角的 **"Settings"** 或 **"Variables"** 标签

### 2. 添加环境变量

点击 **"New Variable"** 或 **"+ Add Variable"**，逐个添加以下变量：

#### 变量 1：DATABASE_URL
```
Name: DATABASE_URL
Value: mysql://root:DYjNhOcmYxDZUPfvqECJTjuqjKZPkRfp@autorack.proxy.rlwy.net:22819/railway
```

#### 变量 2：OPENAI_API_KEY
```
Name: OPENAI_API_KEY
Value: sk-kKYFXPGeWEBxYyxPGhEahs
```

#### 变量 3：NODE_ENV
```
Name: NODE_ENV
Value: production
```

### 3. 保存配置

- 点击 **"Save"** 或 **"Add"** 按钮
- Railway 会自动触发重新部署

---

## 📋 第三步：等待部署完成

### 1. 查看部署日志

- 在项目页面，点击 **"Deployments"** 标签
- 点击最新的部署记录
- 查看实时日志输出

### 2. 等待成功标志

部署成功的标志：
- ✅ 日志中显示 `[api] server listening on port XXXX`
- ✅ 部署状态变为绿色 **"Success"**
- ✅ 没有红色错误信息

预计时间：**3-5 分钟**

---

## 📋 第四步：获取公网域名

### 1. 生成域名

- 在项目页面，点击 **"Settings"** 标签
- 找到 **"Domains"** 或 **"Networking"** 部分
- 点击 **"Generate Domain"** 按钮

### 2. 复制域名

Railway 会生成一个类似这样的域名：
```
fashion-accessories-inventory-production.up.railway.app
```

**请复制这个域名，我们稍后会用到！**

### 3. 测试 API

在浏览器中访问：
```
https://your-domain.up.railway.app/api/health
```

如果看到类似这样的响应，说明部署成功：
```json
{"ok":true,"timestamp":1766767909267}
```

---

## ✅ 完成第一步后的检查清单

在继续之前，请确认：

- [ ] 已成功登录 Railway
- [ ] 已创建项目并连接 GitHub 仓库
- [ ] 已添加所有 3 个环境变量
- [ ] 部署状态显示为 **"Success"**（绿色）
- [ ] 已生成公网域名
- [ ] API 健康检查返回正常响应

---

## 🆘 常见问题

### 问题 1：找不到 GitHub 仓库

**解决方案**：
1. 点击 **"Configure GitHub App"**
2. 确保授权了正确的 GitHub 账号
3. 选择授权 **"All repositories"** 或指定仓库

### 问题 2：部署失败

**检查步骤**：
1. 查看部署日志中的错误信息
2. 确认所有环境变量都已正确添加
3. 检查 `DATABASE_URL` 格式是否正确
4. 点击 **"Redeploy"** 重新部署

### 问题 3：API 无法访问

**检查步骤**：
1. 确认域名已生成
2. 等待 1-2 分钟让 DNS 生效
3. 检查部署日志确认服务已启动
4. 尝试访问 `/api/health` 端点

---

## 📞 需要帮助？

如果遇到任何问题，请：
1. 截图 Railway 的部署日志
2. 截图环境变量配置页面
3. 告诉我具体的错误信息

我会立即协助您解决！

---

## 🎉 下一步

完成上述步骤后，请告诉我：
1. Railway 生成的域名是什么？
2. 部署是否成功？
3. API 健康检查是否正常？

然后我们会继续：
- 更新应用配置使用新的 Railway API 地址
- 重新生成二维码
- 测试应用功能

**准备好了吗？让我们开始吧！** 🚀
