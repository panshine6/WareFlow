# 数据同步机制设计文档

## 📊 现状分析

### 当前数据存储架构

应用采用**双层存储架构**：

1. **本地存储层**（`lib/storage.ts`）
   - 使用 `AsyncStorage` 存储数据
   - 所有 CRUD 操作都在本地完成
   - 数据保存在设备本地，离线可用

2. **云端数据库层**（`server/db.ts` + Railway MySQL）
   - 已配置 Railway MySQL 数据库
   - 已有完整的 tRPC API (`server/routers.ts`)
   - 但**前端未使用这些 API**

### 问题

目前应用只使用本地存储，**没有实现数据同步**：
- ❌ 本地数据不会自动上传到云端
- ❌ 云端数据不会下载到本地
- ❌ 多设备之间无法同步数据
- ❌ 数据没有云端备份

---

## 🎯 同步机制设计

### 设计目标

1. **自动同步**：应用启动时自动同步
2. **手动同步**：用户可以手动触发同步
3. **双向同步**：本地 ↔ 云端
4. **冲突处理**：智能合并冲突数据
5. **离线优先**：离线时仍可使用本地数据

### 同步策略

#### 策略 1：简单覆盖（推荐）

**原理**：
- 上传：将本地所有数据上传到云端，覆盖云端数据
- 下载：将云端所有数据下载到本地，覆盖本地数据

**优点**：
- ✅ 实现简单
- ✅ 逻辑清晰
- ✅ 不会产生冲突

**缺点**：
- ❌ 可能丢失未同步的数据

**适用场景**：
- 单用户使用
- 主要在一台设备上使用
- 偶尔切换设备

#### 策略 2：智能合并（复杂）

**原理**：
- 比较本地和云端数据的时间戳
- 保留最新的数据
- 合并不冲突的数据

**优点**：
- ✅ 不会丢失数据
- ✅ 支持多设备协作

**缺点**：
- ❌ 实现复杂
- ❌ 可能产生冲突

**适用场景**：
- 多用户协作
- 频繁切换设备

### 选择：策略 1（简单覆盖）

考虑到这是个人入库应用，主要在单设备上使用，选择**策略 1**。

---

## 🔧 技术实现

### 1. 同步 API 设计

在 `server/routers.ts` 中添加同步 API：

```typescript
sync: router({
  // 上传本地数据到云端（覆盖）
  upload: protectedProcedure
    .input(z.object({
      products: z.array(z.any()),
    }))
    .mutation(async ({ input }) => {
      // 清空云端数据
      await db.clearAllProducts();
      // 批量插入本地数据
      await db.batchInsertProducts(input.products);
      return { success: true, count: input.products.length };
    }),
  
  // 下载云端数据到本地（覆盖）
  download: protectedProcedure
    .query(async () => {
      const products = await db.getAllProducts();
      return { products };
    }),
  
  // 获取同步状态
  status: protectedProcedure
    .query(async () => {
      const cloudCount = await db.getProductsCount();
      return {
        cloudCount,
        lastSyncTime: await db.getLastSyncTime(),
      };
    }),
})
```

### 2. 同步服务层

创建 `lib/sync.ts`：

```typescript
import { ProductStorage } from './storage';
import { trpc } from './trpc';

export const SyncService = {
  /**
   * 上传本地数据到云端
   */
  async uploadToCloud(): Promise<{ success: boolean; count: number }> {
    try {
      // 1. 获取本地所有数据
      const localProducts = await ProductStorage.getAll();
      
      // 2. 上传到云端
      const result = await trpc.sync.upload.mutate({
        products: localProducts,
      });
      
      // 3. 更新最后同步时间
      await AsyncStorage.setItem('lastSyncTime', new Date().toISOString());
      
      return result;
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  },
  
  /**
   * 从云端下载数据到本地
   */
  async downloadFromCloud(): Promise<{ success: boolean; count: number }> {
    try {
      // 1. 从云端获取数据
      const { products } = await trpc.sync.download.query();
      
      // 2. 清空本地数据
      await AsyncStorage.removeItem('products');
      
      // 3. 保存云端数据到本地
      await AsyncStorage.setItem('products', JSON.stringify(products));
      
      // 4. 更新最后同步时间
      await AsyncStorage.setItem('lastSyncTime', new Date().toISOString());
      
      return { success: true, count: products.length };
    } catch (error) {
      console.error('Download failed:', error);
      throw error;
    }
  },
  
  /**
   * 自动同步（智能选择方向）
   */
  async autoSync(): Promise<{ direction: 'upload' | 'download'; count: number }> {
    try {
      // 1. 获取本地和云端数据数量
      const localProducts = await ProductStorage.getAll();
      const { cloudCount } = await trpc.sync.status.query();
      
      // 2. 如果云端为空，上传本地数据
      if (cloudCount === 0 && localProducts.length > 0) {
        const result = await this.uploadToCloud();
        return { direction: 'upload', count: result.count };
      }
      
      // 3. 如果本地为空，下载云端数据
      if (localProducts.length === 0 && cloudCount > 0) {
        const result = await this.downloadFromCloud();
        return { direction: 'download', count: result.count };
      }
      
      // 4. 如果都有数据，比较最后更新时间
      const lastSyncTime = await AsyncStorage.getItem('lastSyncTime');
      const localLatest = localProducts[0]?.updatedAt || localProducts[0]?.createdAt;
      
      // 简单策略：如果本地有更新，上传；否则下载
      if (localLatest && (!lastSyncTime || new Date(localLatest) > new Date(lastSyncTime))) {
        const result = await this.uploadToCloud();
        return { direction: 'upload', count: result.count };
      } else {
        const result = await this.downloadFromCloud();
        return { direction: 'download', count: result.count };
      }
    } catch (error) {
      console.error('Auto sync failed:', error);
      throw error;
    }
  },
  
  /**
   * 获取同步状态
   */
  async getStatus(): Promise<{
    localCount: number;
    cloudCount: number;
    lastSyncTime: string | null;
  }> {
    try {
      const localProducts = await ProductStorage.getAll();
      const { cloudCount } = await trpc.sync.status.query();
      const lastSyncTime = await AsyncStorage.getItem('lastSyncTime');
      
      return {
        localCount: localProducts.length,
        cloudCount,
        lastSyncTime,
      };
    } catch (error) {
      console.error('Get status failed:', error);
      return {
        localCount: 0,
        cloudCount: 0,
        lastSyncTime: null,
      };
    }
  },
};
```

### 3. UI 组件

在库存管理页面添加同步按钮：

```typescript
// app/(tabs)/inventory.tsx

import { SyncService } from '@/lib/sync';

export default function InventoryScreen() {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  
  // 获取同步状态
  useEffect(() => {
    loadSyncStatus();
  }, []);
  
  async function loadSyncStatus() {
    const status = await SyncService.getStatus();
    setSyncStatus(status);
  }
  
  // 手动上传
  async function handleUpload() {
    setSyncing(true);
    try {
      const result = await SyncService.uploadToCloud();
      Alert.alert('上传成功', `已上传 ${result.count} 条数据到云端`);
      await loadSyncStatus();
    } catch (error) {
      Alert.alert('上传失败', error.message);
    } finally {
      setSyncing(false);
    }
  }
  
  // 手动下载
  async function handleDownload() {
    Alert.alert(
      '确认下载',
      '下载云端数据将覆盖本地数据，确定继续吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            setSyncing(true);
            try {
              const result = await SyncService.downloadFromCloud();
              Alert.alert('下载成功', `已下载 ${result.count} 条数据到本地`);
              await loadSyncStatus();
              // 刷新列表
              loadProducts();
            } catch (error) {
              Alert.alert('下载失败', error.message);
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  }
  
  return (
    <View>
      {/* 现有的导出 Excel 按钮 */}
      <Button onPress={handleExport}>导出 Excel</Button>
      
      {/* 同步按钮 */}
      <View style={styles.syncContainer}>
        <Text style={styles.syncStatus}>
          本地: {syncStatus?.localCount || 0} | 云端: {syncStatus?.cloudCount || 0}
        </Text>
        <Text style={styles.syncTime}>
          {syncStatus?.lastSyncTime 
            ? `最后同步: ${new Date(syncStatus.lastSyncTime).toLocaleString()}`
            : '从未同步'}
        </Text>
        
        <View style={styles.syncButtons}>
          <Button 
            onPress={handleUpload} 
            disabled={syncing}
            icon="cloud-upload"
          >
            上传到云端
          </Button>
          
          <Button 
            onPress={handleDownload} 
            disabled={syncing}
            icon="cloud-download"
          >
            从云端下载
          </Button>
        </View>
      </View>
    </View>
  );
}
```

### 4. 自动同步

在应用启动时自动同步：

```typescript
// app/_layout.tsx

import { SyncService } from '@/lib/sync';

export default function RootLayout() {
  useEffect(() => {
    // 应用启动时自动同步
    async function autoSync() {
      try {
        await SyncService.autoSync();
        console.log('Auto sync completed');
      } catch (error) {
        console.warn('Auto sync failed:', error);
        // 静默失败，不影响应用使用
      }
    }
    
    autoSync();
  }, []);
  
  return (
    // ...
  );
}
```

---

## 📱 用户界面设计

### 库存管理页面

```
┌─────────────────────────────┐
│  库存管理                    │
├─────────────────────────────┤
│  [搜索框]                    │
│                             │
│  产品列表...                 │
│                             │
├─────────────────────────────┤
│  [导出 Excel]               │
├─────────────────────────────┤
│  数据同步                    │
│  本地: 50 | 云端: 48        │
│  最后同步: 2025-12-26 20:30 │
│                             │
│  [⬆️ 上传到云端]  [⬇️ 从云端下载] │
└─────────────────────────────┘
```

### 同步状态指示

- 🟢 **同步中**: 显示加载动画
- 🔵 **已同步**: 本地 = 云端
- 🟡 **未同步**: 本地 ≠ 云端
- 🔴 **同步失败**: 显示错误信息

---

## ⚠️ 注意事项

### 1. 数据安全

- ✅ 下载前提示用户确认（会覆盖本地数据）
- ✅ 上传前检查网络连接
- ✅ 同步失败时不清空本地数据

### 2. 性能优化

- 大量数据时分批上传/下载
- 使用压缩减少传输数据量
- 缓存同步状态减少查询

### 3. 用户体验

- 同步时显示进度
- 同步完成后提示用户
- 离线时禁用同步按钮

### 4. 错误处理

- 网络错误：提示用户检查网络
- 认证错误：提示用户重新登录
- 服务器错误：提示用户稍后重试

---

## 🚀 实施计划

### Phase 1: 后端 API（30 分钟）
- [ ] 添加 sync 路由到 `server/routers.ts`
- [ ] 实现批量插入/清空方法到 `server/db.ts`
- [ ] 测试 API

### Phase 2: 前端服务层（30 分钟）
- [ ] 创建 `lib/sync.ts`
- [ ] 实现上传/下载/自动同步方法
- [ ] 测试同步逻辑

### Phase 3: UI 实现（45 分钟）
- [ ] 在库存页面添加同步按钮
- [ ] 实现同步状态显示
- [ ] 添加加载和错误状态

### Phase 4: 自动同步（15 分钟）
- [ ] 在应用启动时触发自动同步
- [ ] 测试自动同步逻辑

### Phase 5: 测试和优化（30 分钟）
- [ ] 端到端测试
- [ ] 性能优化
- [ ] 用户体验优化

**总计**: 约 2.5 小时

---

## 📝 未来改进

1. **增量同步**: 只同步变更的数据
2. **冲突解决**: 智能合并冲突数据
3. **版本控制**: 支持数据版本回滚
4. **多设备协作**: 实时同步多设备数据
5. **离线队列**: 离线时记录操作，联网后自动同步

---

**文档版本**: v1.0
**创建时间**: 2025-12-26
**作者**: Manus AI Assistant
