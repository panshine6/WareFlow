# 数据库配置文档

## ✅ Railway MySQL 数据库已配置

### 数据库信息

- **服务商**: Railway
- **数据库类型**: MySQL 9.4
- **数据库名**: railway
- **用户名**: root
- **密码**: UzHjxAMVBMQTAPkjyFfbilYLEJbqXSWp

### 连接信息

#### 公网连接（推荐用于应用）
```
主机: hopper.proxy.rlwy.net
端口: 15172
完整 URL: mysql://root:UzHjxAMVBMQTAPkjyFfbilYLEJbqXSWp@hopper.proxy.rlwy.net:15172/railway
```

#### 内网连接（仅 Railway 内部）
```
主机: mysql.railway.internal
端口: 3306
完整 URL: mysql://root:UzHjxAMVBMQTAPkjyFfbilYLEJbqXSWp@mysql.railway.internal:3306/railway
```

### 数据库表结构

已成功创建以下表：

1. **products** - 产品信息表
   - 存储入库产品的详细信息
   - 包含 SKU、图片、数量、位置等字段

2. **inventoryHistory** - 库存历史记录表
   - 记录所有库存操作历史
   - 包含操作类型、操作员、时间戳等

3. **users** - 用户表
   - 存储用户信息和认证数据
   - 支持 OAuth 登录

### 环境变量配置

已在 `.env.local` 文件中配置：

```bash
DATABASE_URL=mysql://root:UzHjxAMVBMQTAPkjyFfbilYLEJbqXSWp@hopper.proxy.rlwy.net:15172/railway
```

### Railway 免费额度

- **每月免费额度**: $5
- **运行时间**: 500 小时/月
- **存储空间**: 无限制（按使用量计费）
- **带宽**: 100GB/月

### 访问 Railway 控制台

- **项目链接**: https://railway.com/project/d37e47ca-5578-42c4-a24b-2255baf303f7
- **项目名称**: serene-freedom
- **环境**: production

### 数据库管理

#### 查看数据库
1. 访问 Railway 控制台
2. 选择 MySQL 服务
3. 点击 "Database" 标签
4. 点击 "Data" 查看表数据

#### 备份数据库
Railway 自动提供数据库备份功能：
1. 访问 Railway 控制台
2. 选择 MySQL 服务
3. 点击 "Backups" 标签
4. 可以手动创建备份或恢复

#### 连接数据库客户端

使用任何 MySQL 客户端（如 MySQL Workbench、DBeaver、TablePlus）连接：

```
Host: hopper.proxy.rlwy.net
Port: 15172
Username: root
Password: UzHjxAMVBMQTAPkjyFfbilYLEJbqXSWp
Database: railway
```

### 注意事项

1. **密码安全**: 请妥善保管数据库密码，不要泄露给他人
2. **免费额度**: 注意监控使用量，避免超出免费额度
3. **数据备份**: 定期备份重要数据
4. **网络连接**: 公网连接可能会有延迟，建议在 Railway 部署后端服务使用内网连接

### 故障排查

#### 连接超时
- 检查网络连接
- 确认防火墙设置
- 验证连接字符串是否正确

#### 认证失败
- 检查用户名和密码是否正确
- 确认数据库名称是否正确

#### 表不存在
- 运行 `pnpm db:push` 重新创建表结构
- 检查数据库迁移是否成功

### 相关命令

```bash
# 推送数据库 schema
pnpm db:push

# 生成数据库迁移
pnpm db:generate

# 查看数据库状态
pnpm db:studio
```

---

**配置完成时间**: 2025-12-26
**配置人员**: Manus AI Assistant
