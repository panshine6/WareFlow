import { int, mysqlEnum, mysqlTable, text, mediumtext, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 产品表 - 存储时尚饰品库存信息
 * 注意：detailImageUri 使用 mediumtext 以支持 base64 图片数据（最大 16MB）
 */
export const products = mysqlTable("products", {
  id: varchar("id", { length: 64 }).primaryKey(),
  detailImageUri: mediumtext("detailImageUri").notNull(),
  overviewImageUri: mediumtext("overviewImageUri").notNull(),
  sku: varchar("sku", { length: 255 }).notNull(),
  systemSku: varchar("systemSku", { length: 64 }),  // 系统生成的 SKU（条形码）
  boxId: varchar("boxId", { length: 64 }),  // 所属 Box ID
  boxName: varchar("boxName", { length: 255 }),  // 所属 Box 名称
  price: decimal("price", { precision: 10, scale: 2 }),  // 产品价格
  quantity: int("quantity").notNull().default(0),
  storageLocation: varchar("storageLocation", { length: 255 }).notNull(),
  operatorId: int("operatorId").notNull(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  isDeleted: int("isDeleted").notNull().default(0),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * 入库历史记录表
 */
export const inventoryHistory = mysqlTable("inventoryHistory", {
  id: varchar("id", { length: 64 }).primaryKey(),
  productId: varchar("productId", { length: 64 }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  operatorId: int("operatorId").notNull(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  quantity: int("quantity").notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  detailImageUri: mediumtext("detailImageUri").notNull(),
  overviewImageUri: mediumtext("overviewImageUri").notNull(),
  notes: text("notes"),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type InventoryHistory = typeof inventoryHistory.$inferSelect;
export type InsertInventoryHistory = typeof inventoryHistory.$inferInsert;

/**
 * 操作员账户表 - 存储系统操作员信息
 * PIN 码使用 SHA-256 哈希存储
 */
export const operators = mysqlTable("operators", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  pinHash: varchar("pinHash", { length: 64 }).notNull(), // SHA-256 哈希值
  isAdmin: int("isAdmin").notNull().default(0), // 0: 普通操作员, 1: 管理员
  isActive: int("isActive").notNull().default(1), // 0: 禁用, 1: 启用
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
});

/**
 * 出库记录表 - 存储出库操作历史
 */
export const outboundRecords = mysqlTable("outboundRecords", {
  id: varchar("id", { length: 64 }).primaryKey(),
  productId: varchar("productId", { length: 64 }).notNull(),
  sku: varchar("sku", { length: 255 }).notNull(),
  quantity: int("quantity").notNull(),
  operatorId: int("operatorId").notNull(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  notes: text("notes"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type Operator = typeof operators.$inferSelect;
export type InsertOperator = typeof operators.$inferInsert;
export type OutboundRecord = typeof outboundRecords.$inferSelect;
export type InsertOutboundRecord = typeof outboundRecords.$inferInsert;
