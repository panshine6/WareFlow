/**
 * AI 计数学习数据存储模块
 * 用于收集 AI 计数结果和用户修正数据，帮助优化 AI 准确性
 */

// 学习数据记录接口
export interface AILearningRecord {
  id: string;                    // 唯一ID
  timestamp: string;             // 时间戳 ISO 格式
  imageBase64: string;           // 全景图原图 base64
  aiCount: number;               // AI 给出的初始数量
  aiCounts?: number[];           // 多次计数的结果（如果有）
  aiConfidence?: 'high' | 'medium' | 'low';  // AI 置信度
  userCount: number;             // 用户最终确认的数量
  isCorrect: boolean;            // AI 是否正确 (aiCount === userCount)
  deviation: number;             // 偏差值 (userCount - aiCount)
}

// 存储键名
const STORAGE_KEY = 'ai_learning_records';

/**
 * 获取所有学习记录
 */
export async function getAllLearningRecords(): Promise<AILearningRecord[]> {
  try {
    if (typeof window === 'undefined') return [];
    
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    return JSON.parse(stored) as AILearningRecord[];
  } catch (error) {
    console.error('[AILearning] Failed to get records:', error);
    return [];
  }
}

/**
 * 保存一条学习记录
 */
export async function saveLearningRecord(record: Omit<AILearningRecord, 'id' | 'timestamp' | 'isCorrect' | 'deviation'>): Promise<AILearningRecord> {
  try {
    const records = await getAllLearningRecords();
    
    const newRecord: AILearningRecord = {
      ...record,
      id: `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      isCorrect: record.aiCount === record.userCount,
      deviation: record.userCount - record.aiCount,
    };
    
    records.push(newRecord);
    
    // 限制最多保存 200 条记录，避免存储空间过大
    const maxRecords = 200;
    const trimmedRecords = records.slice(-maxRecords);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedRecords));
    
    console.log('[AILearning] Saved record:', {
      id: newRecord.id,
      aiCount: newRecord.aiCount,
      userCount: newRecord.userCount,
      isCorrect: newRecord.isCorrect,
      deviation: newRecord.deviation,
    });
    
    return newRecord;
  } catch (error) {
    console.error('[AILearning] Failed to save record:', error);
    throw error;
  }
}

/**
 * 获取学习数据统计
 */
export async function getLearningStats(): Promise<{
  totalRecords: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
  avgDeviation: number;
  overCountRate: number;   // AI 多数的比例
  underCountRate: number;  // AI 少数的比例
}> {
  const records = await getAllLearningRecords();
  
  if (records.length === 0) {
    return {
      totalRecords: 0,
      correctCount: 0,
      incorrectCount: 0,
      accuracy: 0,
      avgDeviation: 0,
      overCountRate: 0,
      underCountRate: 0,
    };
  }
  
  const correctCount = records.filter(r => r.isCorrect).length;
  const incorrectCount = records.length - correctCount;
  const overCount = records.filter(r => r.deviation < 0).length;  // AI 数多了
  const underCount = records.filter(r => r.deviation > 0).length; // AI 数少了
  
  const totalDeviation = records.reduce((sum, r) => sum + Math.abs(r.deviation), 0);
  
  return {
    totalRecords: records.length,
    correctCount,
    incorrectCount,
    accuracy: Math.round((correctCount / records.length) * 100),
    avgDeviation: Math.round((totalDeviation / records.length) * 10) / 10,
    overCountRate: Math.round((overCount / records.length) * 100),
    underCountRate: Math.round((underCount / records.length) * 100),
  };
}

/**
 * 导出学习数据为 JSON
 */
export async function exportLearningData(): Promise<string> {
  const records = await getAllLearningRecords();
  const stats = await getLearningStats();
  
  const exportData = {
    exportTime: new Date().toISOString(),
    version: '1.0',
    stats,
    records,
  };
  
  return JSON.stringify(exportData, null, 2);
}

/**
 * 下载学习数据文件
 */
export async function downloadLearningData(): Promise<void> {
  const jsonData = await exportLearningData();
  
  // 创建 Blob 和下载链接
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  // 生成文件名（中文命名，便于与普通数据库文件区分）
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `AI计数学习数据-${timestamp}.json`;
  
  // 创建下载链接并触发下载
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  // 释放 URL
  URL.revokeObjectURL(url);
  
  console.log('[AILearning] Downloaded:', filename);
}

/**
 * 清空所有学习数据
 */
export async function clearLearningRecords(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  console.log('[AILearning] All records cleared');
}

/**
 * 获取错误案例（AI 数错的记录）
 */
export async function getIncorrectRecords(): Promise<AILearningRecord[]> {
  const records = await getAllLearningRecords();
  return records.filter(r => !r.isCorrect);
}
