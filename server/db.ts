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
  return result.filter((p) => p.sku.toLowerCase().includes(sku.toLowerCase()));
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

export async function getLastSyncTime() {
  const db = await getDb();
  if (!db) return null;
  
  // 获取最后更新的产品时间
  const result = await db.select().from(products).orderBy(desc(products.updatedAt)).limit(1);
  return result[0]?.updatedAt || null;
}
