# iOS Safari IndexedDB 存储策略（WebKit 官方 2023年8月更新）

## 存储配额（Safari 17.0+ / iOS 17+）

### Origin Quota（单个网站的存储限制）
- **浏览器应用**：最高可达设备总磁盘空间的 **60%**
- **其他应用**：最高可达设备总磁盘空间的 **15%**

### Overall Quota（所有网站的总存储限制）
- **浏览器应用**：最高可达设备总磁盘空间的 **80%**
- **其他应用**：最高可达设备总磁盘空间的 **20%**

### Home Screen Web App
- 当 Web 应用作为主屏幕 Web App 运行时，享有与浏览器应用相同的配额

## 数据驱逐（Eviction）

数据可能在以下情况被自动删除：
1. 超过 Overall Quota
2. 系统存储压力大
3. **用户一段时间未与网站交互**（ITP 智能跟踪预防）

### 驱逐策略
- 按 origin 为单位删除
- 使用 LRU（最近最少使用）策略
- 活跃页面或持久化模式的 origin 可能被排除

## Storage API

可以使用 `navigator.storage.estimate()` 获取当前使用量和配额：

```javascript
if (navigator.storage && navigator.storage.estimate) {
  const storageEstimate = await navigator.storage.estimate();
  console.log('Usage:', storageEstimate.usage);
  console.log('Quota:', storageEstimate.quota);
}
```

## 结论

**50MB 限制是过时的信息**。根据 WebKit 官方 2023 年 8 月的更新：
- Safari 17.0+ 的 IndexedDB 配额可以达到设备磁盘空间的 60%
- 对于 128GB 的 iPhone，理论上可以使用约 76GB 的 IndexedDB 存储
- 实际可用空间取决于设备剩余磁盘空间

来源：https://webkit.org/blog/14403/updates-to-storage-policy/
