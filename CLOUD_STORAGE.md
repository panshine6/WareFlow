# 云端存储使用指南

## 概述

时尚饰品入库助手现在支持**云端数据库存储**，实现团队成员之间的数据共享和实时同步。

---

## 架构说明

### 数据库表结构

#### products 表
存储产品基本信息：
- `id`: 产品唯一标识
- `detailImageUri`: 细节图片 URI
- `overviewImageUri`: 全景图片 URI
- `sku`: SKU 编号
- `quantity`: 库存数量
- `storageLocation`: 存储位置
- `operatorId`: 操作员 ID
- `operatorName`: 操作员姓名
- `isDeleted`: 是否已删除（软删除标记）
- `deletedAt`: 删除时间
- `createdAt`: 创建时间
- `updatedAt`: 更新时间

#### inventoryHistory 表
存储入库历史记录：
- `id`: 历史记录 ID
- `productId`: 关联的产品 ID
- `timestamp`: 入库时间
- `operatorId`: 操作员 ID
- `operatorName`: 操作员姓名
- `quantity`: 本次入库数量
- `location`: 存储位置
- `detailImageUri`: 细节图 URI
- `overviewImageUri`: 全景图 URI
- `notes`: 备注

---

## API 接口

### 后端 API (tRPC)

所有 API 接口都在 `server/routers.ts` 中定义，通过 `products` 路由访问：

```typescript
// 查询接口
trpc.products.getAll.query()           // 获取所有产品
trpc.products.getActive.query()        // 获取活跃产品
trpc.products.getDeleted.query()       // 获取已删除产品
trpc.products.getById.query({ id })    // 根据 ID 获取产品
trpc.products.search.query({ sku })    // 按 SKU 搜索
trpc.products.getHistory.query({ productId })  // 获取历史记录

// 操作接口
trpc.products.create.mutate({ ... })          // 创建产品
trpc.products.update.mutate({ id, ... })      // 更新产品
trpc.products.softDelete.mutate({ id })       // 软删除
trpc.products.restore.mutate({ id })          // 恢复产品
trpc.products.permanentDelete.mutate({ id })  // 永久删除
trpc.products.merge.mutate({ ... })           // 合并产品
trpc.products.cleanupOld.mutate()             // 清理旧数据
trpc.products.addHistory.mutate({ ... })      // 添加历史记录
```

---

## 前端使用

### 方式一：使用 React Query Hooks（推荐）

在组件中使用 `useCloudProducts` hook：

```typescript
import { useCloudProducts } from "@/hooks/use-cloud-products";

function MyComponent() {
  const {
    activeProducts,      // 活跃产品列表
    deletedProducts,     // 已删除产品列表
    isLoading,           // 加载状态
    isError,             // 错误状态
    
    // 操作方法
    createProduct,
    updateProduct,
    softDeleteProduct,
    restoreProduct,
    permanentDeleteProduct,
    mergeProduct,
    
    // 刷新数据
    refetch,
    refetchDeleted,
  } = useCloudProducts();

  // 使用数据
  return (
    <View>
      {activeProducts.map((product) => (
        <Text key={product.id}>{product.sku}</Text>
      ))}
    </View>
  );
}
```

### 方式二：获取单个产品详情

```typescript
import { useCloudProduct } from "@/hooks/use-cloud-products";

function ProductDetail({ productId }: { productId: string }) {
  const { product, history, isLoading, refetch } = useCloudProduct(productId);

  if (isLoading) return <ActivityIndicator />;

  return (
    <View>
      <Text>{product?.sku}</Text>
      <Text>历史记录: {history.length} 条</Text>
    </View>
  );
}
```

### 方式三：搜索产品

```typescript
import { useSearchProducts } from "@/hooks/use-cloud-products";

function SearchScreen() {
  const [sku, setSku] = useState("");
  const { results, isLoading } = useSearchProducts(sku);

  return (
    <View>
      <TextInput value={sku} onChangeText={setSku} />
      {results.map((product) => (
        <Text key={product.id}>{product.sku}</Text>
      ))}
    </View>
  );
}
```

---

## 数据同步策略

### 自动刷新
- 活跃产品列表每 30 秒自动刷新
- 确保团队成员看到最新数据

### 手动刷新
```typescript
const { refetch } = useCloudProducts();

// 下拉刷新时调用
const onRefresh = async () => {
  await refetch();
};
```

### 实时更新
- 任何操作（创建、更新、删除）后自动刷新相关数据
- 无需手动调用 refetch

---

## 迁移指南

### 从本地存储迁移到云端存储

#### 步骤 1：替换数据源

**原代码（本地存储）：**
```typescript
import { ProductStorage } from "@/lib/storage";

const products = await ProductStorage.getActive();
```

**新代码（云端存储）：**
```typescript
import { useCloudProducts } from "@/hooks/use-cloud-products";

const { activeProducts, isLoading } = useCloudProducts();
```

#### 步骤 2：替换操作方法

**原代码：**
```typescript
await ProductStorage.softDelete(productId);
```

**新代码：**
```typescript
const { softDeleteProduct } = useCloudProducts();
await softDeleteProduct({ id: productId });
```

#### 步骤 3：处理加载状态

云端存储需要处理网络请求的加载状态：

```typescript
const { activeProducts, isLoading, isError } = useCloudProducts();

if (isLoading) {
  return <ActivityIndicator />;
}

if (isError) {
  return <Text>加载失败，请重试</Text>;
}

// 使用 activeProducts
```

---

## 混合模式（推荐）

保留本地存储作为离线缓存，同时使用云端存储实现团队协作：

```typescript
import { ProductStorage } from "@/lib/storage";  // 本地存储
import { useCloudProducts } from "@/hooks/use-cloud-products";  // 云端存储

function MyComponent() {
  const { activeProducts, isLoading, createProduct } = useCloudProducts();
  const [localProducts, setLocalProducts] = useState([]);

  // 优先使用云端数据，失败时回退到本地
  const products = activeProducts.length > 0 ? activeProducts : localProducts;

  // 同时保存到云端和本地
  const handleCreate = async (product) => {
    try {
      await createProduct(product);  // 云端
      await ProductStorage.add(product);  // 本地备份
    } catch (error) {
      // 云端失败时只保存到本地
      await ProductStorage.add(product);
    }
  };

  return <ProductList products={products} />;
}
```

---

## 团队协作场景

### 场景 1：多人同时入库
- 用户 A 添加产品 → 云端数据库立即更新
- 用户 B 的设备每 30 秒自动刷新 → 看到用户 A 添加的产品

### 场景 2：查看完整历史记录
- 任何团队成员都可以查看产品的完整入库历史
- 包括每次入库的操作员、数量、时间、图片

### 场景 3：回收站管理
- 用户 A 删除产品 → 移至回收站
- 用户 B 可以在回收站中恢复该产品
- 90 天后自动永久删除

---

## 注意事项

1. **需要登录**：所有云端 API 都需要用户登录（使用 `protectedProcedure`）
2. **网络依赖**：云端存储需要网络连接，建议保留本地存储作为离线备份
3. **数据安全**：所有数据存储在 Manus 提供的云端数据库中，自动备份
4. **性能优化**：使用 React Query 的缓存机制，减少不必要的网络请求

---

## 数据库管理

### 查看数据库
在管理 UI 的 Database 面板中可以直接查看和编辑数据。

### 备份数据
```bash
# 导出数据
pnpm db:export

# 导入数据
pnpm db:import
```

---

## 故障排查

### 问题 1：数据不同步
- 检查网络连接
- 检查用户是否已登录
- 手动调用 `refetch()` 刷新数据

### 问题 2：操作失败
- 查看控制台错误信息
- 确认 API 接口是否正常
- 检查数据库连接状态

### 问题 3：历史记录丢失
- 确保使用 `mergeProduct` 或 `addHistory` 方法
- 检查 `inventoryHistory` 表中的数据

---

## 下一步

1. **渐进式迁移**：逐步将关键页面切换到云端存储
2. **离线支持**：保留本地存储作为离线缓存
3. **实时推送**：未来可以添加 WebSocket 实现实时推送
4. **数据分析**：基于云端数据实现库存统计和分析功能
