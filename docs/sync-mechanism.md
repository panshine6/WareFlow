# 当前同步机制说明

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                          云端数据库                              │
│                    (TiDB / MySQL)                               │
│                                                                 │
│  products 表：存储所有产品数据（包括已删除的）                    │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   手机原生 App   │ │   手机 Web 端   │ │   电脑 Web 端   │
│    (SQLite)     │ │  (IndexedDB)    │ │  (IndexedDB)    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## 各平台的同步行为

### 1. 手机原生 App（iOS/Android）

**存储方式**：SQLite 本地数据库

**上传到云端**（uploadToCloud）：
- 读取本地 SQLite 中的所有产品
- 调用 `sync.upload` API（增量更新：upsert）
- 云端存在则更新，不存在则插入
- **不会删除云端已有但本地没有的产品**

**从云端下载**（downloadFromCloud）：
- 调用 `sync.download` API 获取云端所有产品
- 使用 `batchUpsert` 更新本地 SQLite
- **也是增量更新，不会删除本地已有但云端没有的产品**

**日常操作**：
- 新增产品：直接写入本地 SQLite + 调用 `products.create` API 写入云端
- 删除产品：直接更新本地 SQLite + 调用 `products.softDelete` API 更新云端
- 恢复产品：调用 `ProductAPI.restore`（云端 API）
- 永久删除：调用 `ProductAPI.permanentDelete`（云端 API）

---

### 2. 手机 Web 端

**存储方式**：IndexedDB

**上传到云端**（uploadToCloud）：
- 读取本地 IndexedDB 中的所有产品
- 筛选自上次同步后有变化的产品（增量同步）
- 调用 `sync.upload` API（增量更新：upsert）
- **不会删除云端已有但本地没有的产品**

**从云端下载**（downloadFromCloud）：
- 调用 `sync.download` API 获取云端所有产品（含图片）
- 使用 `replaceAll` **完全覆盖**本地 IndexedDB
- **会删除本地已有但云端没有的产品**

**日常操作**：
- 新增产品：写入本地 IndexedDB + 调用 `products.create` API 写入云端
- 删除产品：更新本地 IndexedDB + 调用 `products.softDelete` API 更新云端
- ⚠️ **恢复产品**：只更新本地 IndexedDB（`ProductStorage.restore`），**不同步到云端**
- ⚠️ **永久删除**：只更新本地 IndexedDB（`ProductStorage.permanentDelete`），**不同步到云端**

---

### 3. 电脑 Web 端

**存储方式**：IndexedDB

**上传到云端**：（通常不使用，电脑端主要用于查看）

**从云端下载**（downloadFromCloud）：
- 调用 `sync.downloadWithoutImages` API 获取云端所有产品（**不含图片**）
- 使用 `replaceAll` **完全覆盖**本地 IndexedDB
- 图片在显示时按需从云端加载

**日常操作**：
- ⚠️ **恢复产品**：只更新本地 IndexedDB，**不同步到云端**
- ⚠️ **永久删除**：只更新本地 IndexedDB，**不同步到云端**

---

## 当前问题

### 问题 1：手机/电脑 Web 端的回收站操作不同步

**现象**：
- 在 Web 端恢复或永久删除产品后，下次从云端下载会覆盖本地修改
- 恢复的产品又变成已删除状态
- 永久删除的产品又出现

**原因**：
- Web 端的 `ProductStorage.restore()` 和 `ProductStorage.permanentDelete()` 只修改本地 IndexedDB
- 没有调用云端 API 同步修改
- 下次下载时，云端数据覆盖了本地修改

### 问题 2：同步方向不一致

| 平台 | 上传策略 | 下载策略 |
|------|----------|----------|
| 手机原生 | 增量（upsert） | 增量（upsert） |
| 手机 Web | 增量（upsert） | **完全覆盖** |
| 电脑 Web | - | **完全覆盖** |

手机原生的下载是增量更新，而 Web 端的下载是完全覆盖，这导致行为不一致。

---

## 建议的修复方案

### 方案 A：Web 端操作同步到云端

修改 Web 端的回收站操作，同时调用云端 API：

```typescript
// 恢复产品
const handleRestore = async (product: Product) => {
  // 1. 更新本地
  await ProductStorage.restore(product.id);
  // 2. 同步到云端
  await trpc.products.restore.mutate({ id: product.id });
};

// 永久删除
const handlePermanentDelete = async (product: Product) => {
  // 1. 更新本地
  await ProductStorage.permanentDelete(product.id);
  // 2. 同步到云端
  await trpc.products.permanentDelete.mutate({ id: product.id });
};
```

### 方案 B：统一下载策略

将所有平台的下载策略统一为"完全覆盖"，确保下载后本地与云端完全一致。

---

## 数据流向图

### 手机原生 App 的数据流

```
新增产品：本地 SQLite ──────────────────────► 云端数据库
                     products.create API

删除产品：本地 SQLite ──────────────────────► 云端数据库
                     products.softDelete API

恢复产品：                                    云端数据库
                     products.restore API ──►

永久删除：                                    云端数据库
                     products.permanentDelete API ──►
```

### 手机/电脑 Web 端的数据流（当前）

```
新增产品：本地 IndexedDB ──────────────────► 云端数据库
                        products.create API

删除产品：本地 IndexedDB ──────────────────► 云端数据库
                        products.softDelete API

恢复产品：本地 IndexedDB ✗ 不同步 ✗           云端数据库

永久删除：本地 IndexedDB ✗ 不同步 ✗           云端数据库
```

### 手机/电脑 Web 端的数据流（修复后）

```
新增产品：本地 IndexedDB ──────────────────► 云端数据库
                        products.create API

删除产品：本地 IndexedDB ──────────────────► 云端数据库
                        products.softDelete API

恢复产品：本地 IndexedDB ──────────────────► 云端数据库
                        products.restore API

永久删除：本地 IndexedDB ──────────────────► 云端数据库
                        products.permanentDelete API
```
