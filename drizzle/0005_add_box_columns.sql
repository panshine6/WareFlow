-- 添加 boxId 和 boxName 列到 products 表（用于存储产品所属的 Box 信息）
ALTER TABLE `products` ADD COLUMN `boxId` varchar(64) NULL AFTER `systemSku`;
ALTER TABLE `products` ADD COLUMN `boxName` varchar(255) NULL AFTER `boxId`;
