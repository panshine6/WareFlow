-- 用户设置表 - 存储用户的各种设置数据
CREATE TABLE IF NOT EXISTS `userSettings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `settingKey` varchar(128) NOT NULL UNIQUE,
  `settingValue` mediumtext NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
