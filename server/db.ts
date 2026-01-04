import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== 产品管理相关查询 ====================

import { and, desc } from "drizzle-orm";
import {
  products,
  inventoryHistory,
  type InsertProduct,
  type InsertInventoryHistory,
} from "../drizzle/schema";

export async function getAllProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products).orderBy(desc(products.createdAt));
}

export async function getActiveProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products).where(eq(products.isDeleted, 0)).orderBy(desc(products.createdAt));
}

export async function getDeletedProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products).where(eq(products.isDeleted, 1)).orderBy(desc(products.deletedAt));
}

export async function getProductById(id: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0] || null;
}

export async function searchProductsBySku(sku: string) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select().from(products).where(eq(products.isDeleted, 0)).orderBy(desc(products.createdAt));
  // 同时搜索 sku 和 systemSku 字段
  const searchTerm = sku.toLowerCase();
  return result.filter((p) => 
    p.sku.toLowerCase().includes(searchTerm) || 
    (p.systemSku && p.systemSku.toLowerCase().includes(searchTerm))
  );
}

export async function createProduct(data: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(products).values(data);
  return data.id;
}

export async function updateProduct(id: string, data: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(products).set({ ...data, updatedAt: new Date() }).where(eq(products.id, id));
}

export async function softDeleteProduct(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(products).set({ isDeleted: 1, deletedAt: new Date(), updatedAt: new Date() }).where(eq(products.id, id));
}

export async function restoreProduct(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(products).set({ isDeleted: 0, deletedAt: null, updatedAt: new Date() }).where(eq(products.id, id));
}

export async function permanentDeleteProduct(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(inventoryHistory).where(eq(inventoryHistory.productId, id));
  await db.delete(products).where(eq(products.id, id));
}

export async function cleanupOldDeletedProducts() {
  const db = await getDb();
  if (!db) return 0;
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const toDelete = await db.select().from(products).where(eq(products.isDeleted, 1));
  const oldProducts = toDelete.filter((p) => p.deletedAt && new Date(p.deletedAt) < ninetyDaysAgo);
  for (const product of oldProducts) {
    await permanentDeleteProduct(product.id);
  }
  return oldProducts.length;
}

export async function mergeProduct(existingProductId: string, newEntry: { quantity: number; location: string; detailImageUri: string; overviewImageUri: string; operatorId: number; operatorName: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getProductById(existingProductId);
  if (!existing) throw new Error("产品不存在");
  const historyId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(inventoryHistory).values({ id: historyId, productId: existingProductId, timestamp: new Date(), operatorId: newEntry.operatorId, operatorName: newEntry.operatorName, quantity: newEntry.quantity, location: newEntry.location, detailImageUri: newEntry.detailImageUri, overviewImageUri: newEntry.overviewImageUri });
  await db.update(products).set({ quantity: existing.quantity + newEntry.quantity, updatedAt: new Date() }).where(eq(products.id, existingProductId));
}

export async function getProductHistory(productId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inventoryHistory).where(eq(inventoryHistory.productId, productId)).orderBy(desc(inventoryHistory.timestamp));
}

export async function addInventoryHistory(data: InsertInventoryHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(inventoryHistory).values(data);
}

// ==================== 数据同步相关方法 ====================

export async function getProductsCount() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select().from(products);
  return result.length;
}

export async function clearAllProducts() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(inventoryHistory);
  await db.delete(products);
}

export async function batchInsertProducts(productsData: InsertProduct[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (productsData.length === 0) return;
  
  // 批量插入产品
  for (const product of productsData) {
    await db.insert(products).values(product);
  }
}

/**
 * 增量更新产品（upsert）
 * 存在则更新，不存在则插入
 */
export async function upsertProduct(productData: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(products).values(productData).onDuplicateKeyUpdate({
    set: {
      detailImageUri: productData.detailImageUri,
      overviewImageUri: productData.overviewImageUri,
      sku: productData.sku,
      systemSku: productData.systemSku, // 系统生成的 SKU（条形码）
      boxId: productData.boxId, // 所属 Box ID
      boxName: productData.boxName, // 所属 Box 名称
      price: productData.price, // 产品价格
      quantity: productData.quantity,
      storageLocation: productData.storageLocation,
      operatorId: productData.operatorId,
      operatorName: productData.operatorName,
      isDeleted: productData.isDeleted,
      deletedAt: productData.deletedAt,
      updatedAt: new Date(),
    },
  });
}

/**
 * 批量增量更新产品（upsert）
 * 存在则更新，不存在则插入
 */
export async function batchUpsertProducts(productsData: InsertProduct[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (productsData.length === 0) return;
  
  // 逐个 upsert
  for (const product of productsData) {
    await upsertProduct(product);
  }
}

export async function getLastSyncTime() {
  const db = await getDb();
  if (!db) return null;
  
  // 获取最后更新的产品时间
  const result = await db.select().from(products).orderBy(desc(products.updatedAt)).limit(1);
  return result[0]?.updatedAt || null;
}

// ==================== 操作员账户管理 ====================

import { operators, outboundRecords, type InsertOperator, type InsertOutboundRecord } from "../drizzle/schema";
import crypto from "crypto";

/**
 * 将 PIN 码哈希化（SHA-256）
 */
export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

/**
 * 获取所有操作员（不返回 PIN 哈希）
 */
export async function getAllOperators() {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({
    id: operators.id,
    name: operators.name,
    isAdmin: operators.isAdmin,
    isActive: operators.isActive,
    createdAt: operators.createdAt,
    lastLoginAt: operators.lastLoginAt,
  }).from(operators).orderBy(desc(operators.createdAt));
  return result;
}

/**
 * 根据 ID 获取操作员
 */
export async function getOperatorById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({
    id: operators.id,
    name: operators.name,
    isAdmin: operators.isAdmin,
    isActive: operators.isActive,
    createdAt: operators.createdAt,
    lastLoginAt: operators.lastLoginAt,
  }).from(operators).where(eq(operators.id, id)).limit(1);
  return result[0] || null;
}

/**
 * 根据姓名查找操作员（用于登录）
 */
export async function getOperatorByName(name: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(operators).where(eq(operators.name, name)).limit(1);
  return result[0] || null;
}

/**
 * 验证操作员登录
 */
export async function verifyOperatorLogin(name: string, pin: string) {
  const db = await getDb();
  if (!db) return null;
  
  const operator = await getOperatorByName(name);
  if (!operator) return null;
  if (operator.isActive !== 1) return null;
  
  const pinHash = hashPin(pin);
  if (operator.pinHash !== pinHash) return null;
  
  // 更新最后登录时间
  await db.update(operators).set({ lastLoginAt: new Date() }).where(eq(operators.id, operator.id));
  
  return {
    id: operator.id,
    name: operator.name,
    isAdmin: operator.isAdmin,
    isActive: operator.isActive,
    createdAt: operator.createdAt,
    lastLoginAt: new Date(),
  };
}

/**
 * 创建新操作员
 */
export async function createOperator(name: string, pin: string, isAdmin: number = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 检查姓名是否已存在
  const existing = await getOperatorByName(name);
  if (existing) throw new Error("该姓名已存在");
  
  const pinHash = hashPin(pin);
  const result = await db.insert(operators).values({
    name,
    pinHash,
    isAdmin,
    isActive: 1,
  });
  
  return result;
}

/**
 * 更新操作员信息
 */
export async function updateOperator(id: number, data: { name?: string; pin?: string; isAdmin?: number; isActive?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = {};
  if (data.name) updateData.name = data.name;
  if (data.pin) updateData.pinHash = hashPin(data.pin);
  if (data.isAdmin !== undefined) updateData.isAdmin = data.isAdmin;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  
  await db.update(operators).set(updateData).where(eq(operators.id, id));
}

/**
 * 删除操作员
 */
export async function deleteOperator(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(operators).where(eq(operators.id, id));
}

/**
 * 获取操作员数量
 */
export async function getOperatorsCount() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select().from(operators);
  return result.length;
}

// ==================== 出库记录管理 ====================

/**
 * 获取所有出库记录
 */
export async function getAllOutboundRecords() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(outboundRecords).orderBy(desc(outboundRecords.timestamp));
}

/**
 * 创建出库记录
 */
export async function createOutboundRecord(data: InsertOutboundRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(outboundRecords).values(data);
  return data.id;
}

/**
 * 清空所有出库记录
 */
export async function clearAllOutboundRecords() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(outboundRecords);
}

/**
 * 批量插入出库记录
 */
export async function batchInsertOutboundRecords(records: InsertOutboundRecord[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (records.length === 0) return;
  
  for (const record of records) {
    await db.insert(outboundRecords).values(record);
  }
}

/**
 * 获取出库记录数量
 */
export async function getOutboundRecordsCount() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select().from(outboundRecords);
  return result.length;
}
