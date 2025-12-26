import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "@/types/user";

const USERS_KEY = "users";
const CURRENT_USER_KEY = "currentUser";

/**
 * 用户数据存储工具
 */
export const UserStorage = {
  /**
   * 获取所有用户
   */
  async getAll(): Promise<User[]> {
    try {
      const data = await AsyncStorage.getItem(USERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to load users:", error);
      return [];
    }
  },

  /**
   * 根据 PIN 码查找用户
   */
  async findByPin(pin: string): Promise<User | null> {
    try {
      const users = await this.getAll();
      return users.find((u) => u.pin === pin) || null;
    } catch (error) {
      console.error("Failed to find user by PIN:", error);
      return null;
    }
  },

  /**
   * 根据 ID 查找用户
   */
  async findById(id: number): Promise<User | null> {
    try {
      const users = await this.getAll();
      return users.find((u) => u.id === id) || null;
    } catch (error) {
      console.error("Failed to find user by ID:", error);
      return null;
    }
  },

  /**
   * 创建新用户
   */
  async create(name: string, pin: string): Promise<User> {
    try {
      const users = await this.getAll();
      
      // 检查 PIN 是否已存在
      const existingUser = users.find((u) => u.pin === pin);
      if (existingUser) {
        throw new Error("PIN 码已存在");
      }

      // 生成新 ID
      const newId = users.length > 0 ? Math.max(...users.map((u) => u.id)) + 1 : 1;

      // 创建新用户
      const newUser: User = {
        id: newId,
        name: name.trim(),
        pin: pin.trim(),
        createdAt: new Date().toISOString(),
        isAdmin: users.length === 0, // 第一个用户是管理员
      };

      users.push(newUser);
      await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));

      return newUser;
    } catch (error) {
      console.error("Failed to create user:", error);
      throw error;
    }
  },

  /**
   * 删除用户
   */
  async delete(id: number): Promise<void> {
    try {
      const users = await this.getAll();
      const filtered = users.filter((u) => u.id !== id);
      await AsyncStorage.setItem(USERS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error("Failed to delete user:", error);
      throw error;
    }
  },

  /**
   * 更新用户信息
   */
  async update(id: number, updates: Partial<User>): Promise<void> {
    try {
      const users = await this.getAll();
      const index = users.findIndex((u) => u.id === id);
      if (index !== -1) {
        users[index] = { ...users[index], ...updates };
        await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
      }
    } catch (error) {
      console.error("Failed to update user:", error);
      throw error;
    }
  },

  /**
   * 获取当前登录用户
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const data = await AsyncStorage.getItem(CURRENT_USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Failed to get current user:", error);
      return null;
    }
  },

  /**
   * 设置当前登录用户
   */
  async setCurrentUser(user: User): Promise<void> {
    try {
      await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } catch (error) {
      console.error("Failed to set current user:", error);
      throw error;
    }
  },

  /**
   * 登出（清除当前用户）
   */
  async logout(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CURRENT_USER_KEY);
    } catch (error) {
      console.error("Failed to logout:", error);
      throw error;
    }
  },

  /**
   * 检查是否有用户（用于首次启动）
   */
  async hasUsers(): Promise<boolean> {
    try {
      const users = await this.getAll();
      return users.length > 0;
    } catch (error) {
      console.error("Failed to check users:", error);
      return false;
    }
  },
};
