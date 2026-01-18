# iOS Safari 崩溃分析

## 错误信息
"A problem repeatedly occurred on https://fashion-accessories-inventory.pages.dev/inbound"

## 可能的原因

根据搜索结果和代码分析，iOS Safari 崩溃可能由以下原因导致：

### 1. GPU/内存消耗过高
- 大量使用 `position: fixed/sticky`
- CSS 3D 变换
- 大量图片渲染
- 复合层过多

### 2. IndexedDB 相关问题
- Safari 的 IndexedDB 实现存在已知 bug
- 大数据量读取时内存峰值过高
- 数据库连接在页面加载时失败导致 JavaScript 异常

### 3. 页面加载时的数据处理
- `getActiveProducts()` 一次性加载所有产品数据
- 每个产品包含 Base64 编码的图片（可能很大）
- 内存中同时存在大量图片数据

## 代码分析

### 页面加载流程
1. `_layout.tsx` 调用 `initDatabase()` 初始化 IndexedDB
2. 页面组件（如 `inbound.tsx`）在 `useFocusEffect` 中调用 `ProductStorage.getActive()`
3. `getActive()` 调用 `indexedDBStorage.getActiveProducts()`
4. `getActiveProducts()` 执行 `db.getAll('products')` 获取所有产品
5. 然后在内存中过滤 `filter(p => !p.isDeleted)`

### 问题点
- 一次性加载所有产品（包括 Base64 图片）到内存
- 如果有几百个产品，每个产品图片 100KB-1MB，总内存可能达到几百 MB
- iOS Safari 对内存限制较严格，超出限制会直接崩溃

## 解决方案

### 方案 1：延迟加载图片
- 修改数据结构，将图片存储分离
- 列表只加载元数据，图片按需加载

### 方案 2：分页加载
- 使用 IndexedDB 游标分页读取
- 每次只加载一部分数据

### 方案 3：添加错误边界
- 在 React 组件中添加 Error Boundary
- 捕获 IndexedDB 错误，显示友好提示而非崩溃

### 方案 4：优化 IndexedDB 初始化
- 添加超时机制
- 在初始化失败时提供降级方案
