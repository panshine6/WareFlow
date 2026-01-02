-- 修改 products 表的图片字段为 mediumtext（支持最大 16MB 的 base64 数据）
ALTER TABLE `products` MODIFY COLUMN `detailImageUri` MEDIUMTEXT NOT NULL;
ALTER TABLE `products` MODIFY COLUMN `overviewImageUri` MEDIUMTEXT NOT NULL;

-- 修改 inventoryHistory 表的图片字段为 mediumtext
ALTER TABLE `inventoryHistory` MODIFY COLUMN `detailImageUri` MEDIUMTEXT NOT NULL;
ALTER TABLE `inventoryHistory` MODIFY COLUMN `overviewImageUri` MEDIUMTEXT NOT NULL;
