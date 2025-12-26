CREATE TABLE `inventoryHistory` (
	`id` varchar(64) NOT NULL,
	`productId` varchar(64) NOT NULL,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`operatorId` int NOT NULL,
	`operatorName` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`location` varchar(255) NOT NULL,
	`detailImageUri` text NOT NULL,
	`overviewImageUri` text NOT NULL,
	`notes` text,
	CONSTRAINT `inventoryHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` varchar(64) NOT NULL,
	`detailImageUri` text NOT NULL,
	`overviewImageUri` text NOT NULL,
	`sku` varchar(255) NOT NULL,
	`quantity` int NOT NULL DEFAULT 0,
	`storageLocation` varchar(255) NOT NULL,
	`operatorId` int NOT NULL,
	`operatorName` varchar(255) NOT NULL,
	`isDeleted` int NOT NULL DEFAULT 0,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
