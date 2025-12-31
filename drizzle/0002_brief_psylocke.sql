CREATE TABLE `operators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`pinHash` varchar(64) NOT NULL,
	`isAdmin` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastLoginAt` timestamp,
	CONSTRAINT `operators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outboundRecords` (
	`id` varchar(64) NOT NULL,
	`productId` varchar(64) NOT NULL,
	`sku` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`operatorId` int NOT NULL,
	`operatorName` varchar(255) NOT NULL,
	`notes` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outboundRecords_id` PRIMARY KEY(`id`)
);
