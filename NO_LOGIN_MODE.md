# 无登录模式说明

## 📋 概述

为了让您能够立即使用应用，我们已经将应用配置为**无登录模式**。这意味着您可以直接使用所有功能，无需登录 Manus 账号。

## ✅ 可用功能

所有核心功能都保持正常工作：

### 1. 入库功能
- ✅ 微距拍照
- ✅ SKU 输入
- ✅ 全景拍照
- ✅ AI 识别数量
- ✅ 位置记录
- ✅ 保存到本地和云端

### 2. AI 辅助查重
- ✅ 图像相似度对比
- ✅ 重复产品检测
- ✅ 智能提醒

### 3. 库存管理
- ✅ 产品列表
- ✅ 搜索功能
- ✅ 产品详情
- ✅ 编辑产品
- ✅ 删除产品（软删除）
- ✅ 历史记录

### 4. 回收站系统
- ✅ 软删除
- ✅ 恢复产品
- ✅ 永久删除
- ✅ 自动清理

### 5. 数据导出
- ✅ Excel 导出（店小秘格式）
- ✅ 图片嵌入
- ✅ 完整数据

### 6. 数据同步
- ✅ 上传到云端
- ✅ 从云端下载
- ✅ 同步状态显示
- ✅ 数据一致性检查

### 7. 反馈系统
- ✅ 问题反馈
- ✅ 截图捕获

## 🔧 技术说明

### 修改内容

在 `app/(tabs)/index.tsx` 文件中：

1. **注释掉登录检查**：
   ```typescript
   // 跳过登录检查 - 直接显示主界面
   // 注释：如果将来需要登录功能，取消下面的注释
   /*
   if (authLoading) {
     return <ThemedView style={styles.loadingContainer}>...</ThemedView>;
   }
   if (!isAuthenticated) {
     return <WelcomeScreen />;
   }
   */
   ```

2. **隐藏用户信息**：
   ```typescript
   {/* 用户信息已隐藏 - 如需登录功能请取消注释 */}
   {/* user && (
     <View style={styles.userContainer}>
       <ThemedText style={styles.userName}>...</ThemedText>
       <Pressable onPress={logout}>...</Pressable>
     </View>
   ) */}
   ```

### 数据存储

- **本地存储**：使用 AsyncStorage，数据保存在手机本地
- **云端存储**：使用 Railway MySQL 数据库
- **同步机制**：手动上传/下载，确保数据安全

## 🔄 如何恢复登录功能

如果将来需要启用登录功能：

### 步骤 1：在 Manus 平台注册应用

1. 访问 Manus 开发者平台
2. 创建新应用
3. 获取 App ID

### 步骤 2：更新配置

在 `.env.local` 文件中：

```bash
EXPO_PUBLIC_APP_ID=your-real-app-id
EXPO_PUBLIC_OAUTH_PORTAL_URL=https://manus.im
EXPO_PUBLIC_OAUTH_SERVER_URL=https://api.manus.space
```

### 步骤 3：取消代码注释

在 `app/(tabs)/index.tsx` 文件中：

1. 取消登录检查的注释：
   ```typescript
   // 如果正在加载认证状态，显示加载指示器
   if (authLoading) {
     return (
       <ThemedView style={styles.loadingContainer}>
         <ActivityIndicator size="large" />
       </ThemedView>
     );
   }

   // 如果未登录，显示欢迎页面
   if (!isAuthenticated) {
     return <WelcomeScreen />;
   }
   ```

2. 取消用户信息的注释：
   ```typescript
   {user && (
     <View style={styles.userContainer}>
       <ThemedText style={styles.userName}>
         {user.name || user.email || "用户"}
       </ThemedText>
       <Pressable onPress={logout} style={styles.logoutButton}>
         <ThemedText style={styles.logoutButtonText}>登出</ThemedText>
       </Pressable>
     </View>
   )}
   ```

### 步骤 4：重启应用

1. 提交代码到 Git
2. 推送到 GitHub
3. 重启 Expo 开发服务器
4. 在手机上刷新应用

## 📊 当前配置

### 环境变量（`.env.local`）

```bash
# OpenAI API Key
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-ExTqV95...

# Database Configuration
DATABASE_URL=mysql://root:UzHjxAMVBMQTAPkjyFfbilYLEJbqXSWp@hopper.proxy.rlwy.net:15172/railway

# Manus OAuth Configuration (当前未使用)
EXPO_PUBLIC_OAUTH_SERVER_URL=https://api.manus.space
EXPO_PUBLIC_OAUTH_PORTAL_URL=https://manus.im
EXPO_PUBLIC_APP_ID=fashion-accessories-inventory
```

### 服务器

- **后端 API**：运行在端口 3001
- **Expo Metro**：运行在端口 8082
- **数据库**：Railway MySQL

## ⚠️ 注意事项

### 数据安全

- 本地数据：保存在手机 AsyncStorage 中，卸载应用会丢失
- 云端数据：保存在 Railway MySQL 数据库中，永久保存
- **建议**：定期使用"上传到云端"功能备份数据

### 多设备使用

- 无登录模式下，不同设备的数据是独立的
- 如需多设备同步，请使用"数据同步"功能：
  1. 在设备 A 上点击"上传到云端"
  2. 在设备 B 上点击"从云端下载"

### 团队协作

- 无登录模式不支持多用户协作
- 如需团队使用，建议启用登录功能
- 每个用户将有独立的数据空间

## 🎯 推荐使用方式

### 个人使用（当前模式）

1. 正常使用所有功能
2. 定期点击"上传到云端"备份数据
3. 换设备前先上传数据
4. 新设备上点击"从云端下载"恢复数据

### 团队使用（需要登录）

1. 在 Manus 平台注册应用
2. 启用登录功能
3. 每个成员用自己的账号登录
4. 数据自动同步到各自的账号

## 📞 需要帮助？

如果您在使用过程中遇到任何问题，请参考 `HOW_TO_REPORT_BUGS_AND_CONTINUE_DEVELOPMENT.md` 文件，在新的 Manus 对话中反馈问题。

---

**最后更新**：2025-12-26  
**版本**：1.0.0  
**提交**：fe6c99b
