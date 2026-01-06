/**
 * AI 查重学习数据存储模块
 * 用于收集用户对 AI 相似度判断的反馈，以便后续优化
 */

import { Platform } from 'react-native';

// 学习数据记录接口
export interface SimilarityLearningRecord {
  id: string;
  timestamp: string;
  // 新图片（细节图）
  newImageBase64: string;
  // 对比图片（库存中的图片）
  existingImageBase64: string;
  existingProductSku: string;
  // AI 给出的结果
  aiSimilarityScore: number;
  aiScores: number[];  // 3次查重的分数
  aiConfidence: 'high' | 'medium' | 'low';
  aiAnalysisNote: string;
  // 用户反馈
  userSimilarityScore: number;  // 用户认为的相似度
  userJudgment: 'same' | 'similar' | 'different';  // 用户判断：相同/相似/不同
  // 偏差分析
  deviation: number;  // userSimilarityScore - aiSimilarityScore
}

// 数据库名称和存储名称
const DB_NAME = 'SimilarityLearningDB';
const STORE_NAME = 'learningRecords';
const DB_VERSION = 1;

// IndexedDB 实例
let dbInstance: IDBDatabase | null = null;

/**
 * 初始化 IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  
  // 仅在 Web 端使用 IndexedDB
  if (Platform.OS !== 'web' || typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is only available on web platform');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[SimilarityLearning] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('[SimilarityLearning] Database opened successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('userJudgment', 'userJudgment', { unique: false });
        console.log('[SimilarityLearning] Object store created');
      }
    };
  });
}

/**
 * 保存学习数据记录
 */
export async function saveLearningRecord(record: Omit<SimilarityLearningRecord, 'id' | 'timestamp' | 'deviation'>): Promise<string> {
  try {
    const db = await initDB();
    
    const id = `sim_learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullRecord: SimilarityLearningRecord = {
      ...record,
      id,
      timestamp: new Date().toISOString(),
      deviation: record.userSimilarityScore - record.aiSimilarityScore,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(fullRecord);

      request.onsuccess = () => {
        console.log('[SimilarityLearning] Record saved:', id);
        resolve(id);
      };

      request.onerror = () => {
        console.error('[SimilarityLearning] Failed to save record:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[SimilarityLearning] Error saving record:', error);
    throw error;
  }
}

/**
 * 获取所有学习数据记录
 */
export async function getAllLearningRecords(): Promise<SimilarityLearningRecord[]> {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result || [];
        // 按时间倒序排列
        records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        resolve(records);
      };

      request.onerror = () => {
        console.error('[SimilarityLearning] Failed to get records:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[SimilarityLearning] Error getting records:', error);
    return [];
  }
}

/**
 * 获取学习数据统计信息
 */
export async function getLearningStats(): Promise<{
  totalRecords: number;
  sameCount: number;
  similarCount: number;
  differentCount: number;
  avgDeviation: number;
  overEstimateRate: number;  // AI 高估的比例
  underEstimateRate: number;  // AI 低估的比例
}> {
  try {
    const records = await getAllLearningRecords();
    
    if (records.length === 0) {
      return {
        totalRecords: 0,
        sameCount: 0,
        similarCount: 0,
        differentCount: 0,
        avgDeviation: 0,
        overEstimateRate: 0,
        underEstimateRate: 0,
      };
    }

    const sameCount = records.filter(r => r.userJudgment === 'same').length;
    const similarCount = records.filter(r => r.userJudgment === 'similar').length;
    const differentCount = records.filter(r => r.userJudgment === 'different').length;
    
    const totalDeviation = records.reduce((sum, r) => sum + r.deviation, 0);
    const avgDeviation = totalDeviation / records.length;
    
    const overEstimateCount = records.filter(r => r.deviation < -10).length;  // AI 分数比用户高 10 分以上
    const underEstimateCount = records.filter(r => r.deviation > 10).length;  // AI 分数比用户低 10 分以上
    
    return {
      totalRecords: records.length,
      sameCount,
      similarCount,
      differentCount,
      avgDeviation: Math.round(avgDeviation * 10) / 10,
      overEstimateRate: Math.round((overEstimateCount / records.length) * 100),
      underEstimateRate: Math.round((underEstimateCount / records.length) * 100),
    };
  } catch (error) {
    console.error('[SimilarityLearning] Error getting stats:', error);
    return {
      totalRecords: 0,
      sameCount: 0,
      similarCount: 0,
      differentCount: 0,
      avgDeviation: 0,
      overEstimateRate: 0,
      underEstimateRate: 0,
    };
  }
}

/**
 * 导出学习数据为 JSON 文件
 */
export async function downloadLearningData(): Promise<void> {
  try {
    const records = await getAllLearningRecords();
    const stats = await getLearningStats();
    
    const exportData = {
      exportTime: new Date().toISOString(),
      version: '1.0',
      type: 'similarity_learning',
      stats,
      records,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `AI查重学习数据-${timestamp}.json`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('[SimilarityLearning] Data exported:', filename);
  } catch (error) {
    console.error('[SimilarityLearning] Error exporting data:', error);
    throw error;
  }
}

/**
 * 清空所有学习数据
 */
export async function clearAllLearningRecords(): Promise<void> {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[SimilarityLearning] All records cleared');
        resolve();
      };

      request.onerror = () => {
        console.error('[SimilarityLearning] Failed to clear records:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[SimilarityLearning] Error clearing records:', error);
    throw error;
  }
}
