-- 添加 systemSku 列到 products 表（用于存储系统生成的条形码 SKU）
ALTER TABLE `products` ADD COLUMN `systemSku` varchar(64) NULL AFTER `sku`;
