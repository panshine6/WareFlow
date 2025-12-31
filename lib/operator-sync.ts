import AsyncStorage from "@react-native-async-storage/async-storage";
import { UserStorage } from "./user-storage";
import type { User } from "@/types/user";

const OPERATOR_SYNC_KEY = "operatorSyncEnabled";
const CACHED_OPERATORS_KEY = "cachedOperators";
const LAST_ONLINE_LOGIN_KEY = "lastOnlineLogin";
const OFFLINE_VALIDITY_DAYS = 30; // 离线有效期 30 天

// 缓存的操作员信息（用于离线登录）
interface CachedOperator {
  id: number;
  name: string;
  pinHash: string; // 本地存储的 PIN 哈希（用于离线验证）
  isAdmin: boolean;
  cachedAt: string; // 缓存时间
}

/**
 * 简单的 PIN 哈希函数（用于本地离线验证）
 * 注意：这不是加密级别的哈希，仅用于本地验证
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * 操作员云端同步服务
 * 
 * 支持混合模式：
 * 1. 在线时：云端验证账户
 * 2. 离线时：使用本地缓存验证（30天有效期）
 */
export const OperatorSyncService = {
  /**
   * 检查是否启用了云端同步
   */
  async isCloudSyncEnabled(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(OPERATOR_SYNC_KEY);
      return value === "true";
    } catch {
      return false;
    }
  },

  /**
   * 启用云端同步
   */
  async enableCloudSync(): Promise<void> {
    await AsyncStorage.setItem(OPERATOR_SYNC_KEY, "true");
  },

  /**
   * 禁用云端同步
   */
  async disableCloudSync(): Promise<void> {
    await AsyncStorage.setItem(OPERATOR_SYNC_KEY, "false");
  },

  /**
   * 检查网络连接
   */
  async checkNetworkConnection(trpcClient: any): Promise<boolean> {
    try {
      // 尝试调用一个简单的 API 来检查网络
      await trpcClient.operators.count.query();
      return true;
    } catch (error) {
      console.log("[OperatorSync] Network check failed:", error);
      return false;
    }
  },

  /**
   * 检查离线登录是否仍然有效
   */
  async isOfflineLoginValid(): Promise<boolean> {
    try {
      const lastLoginStr = await AsyncStorage.getItem(LAST_ONLINE_LOGIN_KEY);
      if (!lastLoginStr) return false;
      
      const lastLogin = new Date(lastLoginStr);
      const now = new Date();
      const diffDays = (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
      
      return diffDays <= OFFLINE_VALIDITY_DAYS;
    } catch {
      return false;
    }
  },

  /**
   * 记录在线登录时间
   */
  async recordOnlineLogin(): Promise<void> {
    await AsyncStorage.setItem(LAST_ONLINE_LOGIN_KEY, new Date().toISOString());
  },

  /**
   * 获取缓存的操作员列表
   */
  async getCachedOperators(): Promise<CachedOperator[]> {
    try {
      const cached = await AsyncStorage.getItem(CACHED_OPERATORS_KEY);
      if (!cached) return [];
      return JSON.parse(cached);
    } catch {
      return [];
    }
  },

  /**
   * 缓存操作员信息（登录成功后调用）
   */
  async cacheOperator(operator: { id: number; name: string; isAdmin: boolean }, pin: string): Promise<void> {
    try {
      const cached = await this.getCachedOperators();
      
      // 查找是否已存在
      const existingIndex = cached.findIndex(op => op.id === operator.id);
      
      const newCached: CachedOperator = {
        id: operator.id,
        name: operator.name,
        pinHash: simpleHash(pin),
        isAdmin: operator.isAdmin,
        cachedAt: new Date().toISOString(),
      };
      
      if (existingIndex >= 0) {
        cached[existingIndex] = newCached;
      } else {
        cached.push(newCached);
      }
      
      await AsyncStorage.setItem(CACHED_OPERATORS_KEY, JSON.stringify(cached));
    } catch (error) {
      console.error("[OperatorSync] Failed to cache operator:", error);
    }
  },

  /**
   * 从云端获取所有操作员
   */
  async getCloudOperators(trpcClient: any): Promise<any[]> {
    try {
      const operators = await trpcClient.operators.getAll.query();
      return operators;
    } catch (error) {
      console.error("[OperatorSync] Failed to get cloud operators:", error);
      return [];
    }
  },

  /**
   * 离线登录验证
   */
  async offlineLogin(name: string, pin: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      // 检查离线有效期
      const isValid = await this.isOfflineLoginValid();
      if (!isValid) {
        return { success: false, error: "离线登录已过期，请连接网络重新登录" };
      }
      
      // 获取缓存的操作员
      const cached = await this.getCachedOperators();
      const operator = cached.find(op => op.name === name);
      
      if (!operator) {
        return { success: false, error: "未找到该账户的离线缓存" };
      }
      
      // 验证 PIN
      if (operator.pinHash !== simpleHash(pin)) {
        return { success: false, error: "PIN 码不正确" };
      }
      
      // 创建用户对象
      const user: User = {
        id: operator.id,
        name: operator.name,
        pin: "", // 不存储 PIN
        createdAt: operator.cachedAt,
        isAdmin: operator.isAdmin,
      };
      
      // 保存到本地
      await UserStorage.setCurrentUser(user);
      
      return { success: true, user };
    } catch (error: any) {
      console.error("[OperatorSync] Offline login failed:", error);
      return { success: false, error: error.message || "离线登录失败" };
    }
  },

  /**
   * 云端登录验证
   */
  async cloudLogin(trpcClient: any, name: string, pin: string): Promise<{ success: boolean; user?: User; error?: string; isOffline?: boolean }> {
    try {
      // 先检查网络
      const isOnline = await this.checkNetworkConnection(trpcClient);
      
      if (!isOnline) {
        // 离线模式
        console.log("[OperatorSync] Network unavailable, trying offline login");
        const result = await this.offlineLogin(name, pin);
        return { ...result, isOffline: true };
      }
      
      // 在线模式
      const result = await trpcClient.operators.login.mutate({ name, pin });
      
      if (!result.success) {
        return { success: false, error: result.error, isOffline: false };
      }
      
      // 转换为本地 User 格式
      const user: User = {
        id: result.operator.id,
        name: result.operator.name,
        pin: "", // 不存储 PIN
        createdAt: new Date(result.operator.createdAt).toISOString(),
        isAdmin: result.operator.isAdmin === 1,
      };
      
      // 保存到本地
      await UserStorage.setCurrentUser(user);
      
      // 缓存操作员信息（用于离线登录）
      await this.cacheOperator({
        id: result.operator.id,
        name: result.operator.name,
        isAdmin: result.operator.isAdmin === 1,
      }, pin);
      
      // 记录在线登录时间
      await this.recordOnlineLogin();
      
      return { success: true, user, isOffline: false };
    } catch (error: any) {
      console.error("[OperatorSync] Cloud login failed, trying offline:", error);
      // 网络错误时尝试离线登录
      const result = await this.offlineLogin(name, pin);
      return { ...result, isOffline: true };
    }
  },

  /**
   * 云端创建操作员
   */
  async cloudCreateOperator(trpcClient: any, name: string, pin: string, isAdmin: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await trpcClient.operators.create.mutate({
        name,
        pin,
        isAdmin: isAdmin ? 1 : 0,
      });
      
      return result;
    } catch (error: any) {
      console.error("[OperatorSync] Cloud create operator failed:", error);
      return { success: false, error: error.message || "创建失败" };
    }
  },

  /**
   * 检查云端是否有操作员
   */
  async hasCloudOperators(trpcClient: any): Promise<boolean> {
    try {
      const { count } = await trpcClient.operators.count.query();
      return count > 0;
    } catch (error) {
      console.error("[OperatorSync] Failed to check cloud operators:", error);
      return false;
    }
  },

  /**
   * 获取操作员列表（优先云端，离线时用缓存）
   */
  async getOperators(trpcClient: any): Promise<{ operators: any[]; isOffline: boolean }> {
    try {
      // 尝试从云端获取
      const isOnline = await this.checkNetworkConnection(trpcClient);
      
      if (isOnline) {
        const operators = await this.getCloudOperators(trpcClient);
        return { operators, isOffline: false };
      } else {
        // 离线时使用缓存
        const cached = await this.getCachedOperators();
        const operators = cached.map(op => ({
          id: op.id,
          name: op.name,
          isAdmin: op.isAdmin ? 1 : 0,
          isActive: 1,
          createdAt: op.cachedAt,
          lastLoginAt: null,
        }));
        return { operators, isOffline: true };
      }
    } catch (error) {
      // 出错时使用缓存
      const cached = await this.getCachedOperators();
      const operators = cached.map(op => ({
        id: op.id,
        name: op.name,
        isAdmin: op.isAdmin ? 1 : 0,
        isActive: 1,
        createdAt: op.cachedAt,
        lastLoginAt: null,
      }));
      return { operators, isOffline: true };
    }
  },

  /**
   * 初始化管理员账户（首次使用时）
   */
  async initAdminAccount(trpcClient: any, name: string, pin: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 检查网络
      const isOnline = await this.checkNetworkConnection(trpcClient);
      if (!isOnline) {
        return { success: false, error: "首次使用需要联网创建账户" };
      }
      
      // 检查是否已有操作员
      const hasOperators = await this.hasCloudOperators(trpcClient);
      if (hasOperators) {
        return { success: false, error: "已存在操作员账户" };
      }
      
      // 创建管理员账户
      const result = await this.cloudCreateOperator(trpcClient, name, pin, true);
      
      if (result.success) {
        // 启用云端同步
        await this.enableCloudSync();
        
        // 缓存管理员信息
        // 需要先获取创建的操作员 ID
        const operators = await this.getCloudOperators(trpcClient);
        const admin = operators.find(op => op.name === name);
        if (admin) {
          await this.cacheOperator({
            id: admin.id,
            name: admin.name,
            isAdmin: true,
          }, pin);
        }
        
        // 记录在线登录时间
        await this.recordOnlineLogin();
      }
      
      return result;
    } catch (error: any) {
      console.error("[OperatorSync] Failed to init admin account:", error);
      return { success: false, error: error.message || "初始化失败" };
    }
  },

  /**
   * 获取离线有效期剩余天数
   */
  async getOfflineValidityDaysRemaining(): Promise<number> {
    try {
      const lastLoginStr = await AsyncStorage.getItem(LAST_ONLINE_LOGIN_KEY);
      if (!lastLoginStr) return 0;
      
      const lastLogin = new Date(lastLoginStr);
      const now = new Date();
      const diffDays = (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
      
      return Math.max(0, Math.ceil(OFFLINE_VALIDITY_DAYS - diffDays));
    } catch {
      return 0;
    }
  },
};
