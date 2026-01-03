/**
 * Box 本地存储服务
 * 使用 IndexedDB 存储 Box 数据
 */

import type { Box, BoxItem, CreateBoxInput, AddItemToBoxInput } from '@/types/box';
import { ProductStorage } from './storage';

const DB_NAME = 'wareflow-boxes';
const DB_VERSION = 1;
const STORE_NAME = 'boxes';

let db: IDBDatabase | null = null;

/**
 * 初始化 IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[BoxStorage] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('[BoxStorage] Database opened successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('location', 'location', { unique: false });
        store.createIndex('prefix', 'prefix', { unique: false });
        console.log('[BoxStorage] Object store created');
      }
    };
  });
}

/**
 * 生成 Box ID
 * 格式：prefix-Box-N（如 LB-RF-GM-Box-1）
 */
async function generateBoxId(prefix: string): Promise<string> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const boxes = request.result as Box[];
      // 找出同一前缀下的最大编号
      const samePrefix = boxes.filter(b => b.id.startsWith(`${prefix}-Box-`));
      let maxNum = 0;
      samePrefix.forEach(b => {
        const match = b.id.match(/-Box-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      resolve(`${prefix}-Box-${maxNum + 1}`);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 创建新的 Box
 */
export async function createBox(input: CreateBoxInput): Promise<Box> {
  const database = await initDB();
  const boxId = await generateBoxId(input.prefix);
  
  const box: Box = {
    id: boxId,
    name: boxId,
    location: input.location,
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'open',
    operatorId: input.operatorId,
    operatorName: input.operatorName,
    notes: input.notes,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(box);

    request.onsuccess = () => {
      console.log('[BoxStorage] Box created:', boxId);
      resolve(box);
    };

    request.onerror = () => {
      console.error('[BoxStorage] Failed to create box:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 获取所有 Box
 */
export async function getAllBoxes(): Promise<Box[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const boxes = request.result as Box[];
      // 按创建时间倒序排列
      boxes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(boxes);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 根据 ID 获取 Box
 */
export async function getBoxById(boxId: string): Promise<Box | null> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(boxId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取状态为 open 的 Box 列表
 */
export async function getOpenBoxes(): Promise<Box[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll('open');

    request.onsuccess = () => {
      const boxes = request.result as Box[];
      boxes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(boxes);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 添加产品到 Box
 */
export async function addItemToBox(input: AddItemToBoxInput): Promise<Box> {
  const database = await initDB();
  const box = await getBoxById(input.boxId);

  if (!box) {
    throw new Error(`Box not found: ${input.boxId}`);
  }

  if (box.status === 'closed') {
    throw new Error(`Box is closed: ${input.boxId}`);
  }

  const newItem: BoxItem = {
    productId: input.productId,
    sku: input.sku,
    systemSku: input.systemSku,
    quantity: input.quantity,
    addedAt: new Date().toISOString(),
  };

  // 检查是否已存在相同产品，如果存在则累加数量
  const existingIndex = box.items.findIndex(item => item.productId === input.productId);
  if (existingIndex >= 0) {
    box.items[existingIndex].quantity += input.quantity;
  } else {
    box.items.push(newItem);
  }

  box.updatedAt = new Date().toISOString();

  // 同时更新产品的 boxId 和 boxName
  try {
    await ProductStorage.update(input.productId, {
      boxId: input.boxId,
      boxName: box.name,
    });
    console.log('[BoxStorage] Product boxId updated:', input.productId, '->', input.boxId);
  } catch (error) {
    console.error('[BoxStorage] Failed to update product boxId:', error);
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(box);

    request.onsuccess = () => {
      console.log('[BoxStorage] Item added to box:', input.boxId);
      resolve(box);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 从 Box 中移除产品
 */
export async function removeItemFromBox(boxId: string, productId: string): Promise<Box> {
  const database = await initDB();
  const box = await getBoxById(boxId);

  if (!box) {
    throw new Error(`Box not found: ${boxId}`);
  }

  box.items = box.items.filter(item => item.productId !== productId);
  box.updatedAt = new Date().toISOString();

  // 清除产品的 boxId 和 boxName
  try {
    await ProductStorage.update(productId, {
      boxId: undefined,
      boxName: undefined,
    });
    console.log('[BoxStorage] Product boxId cleared:', productId);
  } catch (error) {
    console.error('[BoxStorage] Failed to clear product boxId:', error);
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(box);

    request.onsuccess = () => {
      console.log('[BoxStorage] Item removed from box:', boxId);
      resolve(box);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 封箱（关闭 Box）
 */
export async function closeBox(boxId: string): Promise<Box> {
  const database = await initDB();
  const box = await getBoxById(boxId);

  if (!box) {
    throw new Error(`Box not found: ${boxId}`);
  }

  box.status = 'closed';
  box.updatedAt = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(box);

    request.onsuccess = () => {
      console.log('[BoxStorage] Box closed:', boxId);
      resolve(box);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 重新打开 Box
 */
export async function reopenBox(boxId: string): Promise<Box> {
  const database = await initDB();
  const box = await getBoxById(boxId);

  if (!box) {
    throw new Error(`Box not found: ${boxId}`);
  }

  box.status = 'open';
  box.updatedAt = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(box);

    request.onsuccess = () => {
      console.log('[BoxStorage] Box reopened:', boxId);
      resolve(box);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 更新 Box 位置
 */
export async function updateBoxLocation(boxId: string, location: string): Promise<Box> {
  const database = await initDB();
  const box = await getBoxById(boxId);

  if (!box) {
    throw new Error(`Box not found: ${boxId}`);
  }

  box.location = location;
  box.updatedAt = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(box);

    request.onsuccess = () => {
      console.log('[BoxStorage] Box location updated:', boxId);
      resolve(box);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除 Box
 */
export async function deleteBox(boxId: string): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(boxId);

    request.onsuccess = () => {
      console.log('[BoxStorage] Box deleted:', boxId);
      resolve();
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取 Box 内产品总数
 */
export function getBoxItemCount(box: Box): number {
  return box.items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * 生成 Box 条形码内容（与 Box ID 相同）
 */
export function generateBoxBarcode(box: Box): string {
  return box.id;
}
