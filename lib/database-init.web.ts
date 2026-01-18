/**
 * Web 平台数据库初始化
 * 使用 IndexedDB
 */
import { indexedDBStorage } from './indexeddb-storage';

// 初始化状态
let isInitialized = false;
let initializationError: Error | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * 初始化数据库
 * 添加了防重复初始化和错误传播机制
 */
export async function initDatabase(): Promise<void> {
  // 如果已经初始化成功，直接返回
  if (isInitialized) {
    return;
  }

  // 如果有初始化错误，抛出错误让调用者处理
  if (initializationError) {
    throw initializationError;
  }

  // 如果正在初始化，等待初始化完成
  if (initializationPromise) {
    await initializationPromise;
    if (initializationError) {
      throw initializationError;
    }
    return;
  }

  // 开始初始化
  initializationPromise = doInitialize();
  
  try {
    await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

async function doInitialize(): Promise<void> {
  try {
    console.log('[DatabaseInit] Starting IndexedDB initialization...');
    
    // 检查 IndexedDB 是否可用
    if (typeof indexedDB === 'undefined') {
      throw new Error('您的浏览器不支持 IndexedDB，请使用 Safari 或 Chrome');
    }

    await indexedDBStorage.init();
    
    isInitialized = true;
    initializationError = null;
    console.log('[DatabaseInit] IndexedDB initialized successfully');
    
  } catch (error: any) {
    console.error('[DatabaseInit] Failed to initialize IndexedDB:', error);
    initializationError = error;
    isInitialized = false;
    throw error;
  }
}

/**
 * 重置初始化状态（用于重试）
 */
export function resetDatabaseInit(): void {
  isInitialized = false;
  initializationError = null;
  initializationPromise = null;
}

/**
 * 获取初始化状态
 */
export function getDatabaseInitStatus(): { 
  isInitialized: boolean; 
  error: Error | null;
  isInitializing: boolean;
} {
  return {
    isInitialized,
    error: initializationError,
    isInitializing: initializationPromise !== null,
  };
}
