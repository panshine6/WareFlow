/**
 * 用户/操作员类型定义
 */

export interface User {
  id: number;
  name: string;
  pin: string;
  createdAt: string;
  isAdmin: boolean; // 是否是管理员（第一个创建的用户）
}

export interface AuthState {
  isAuthenticated: boolean;
  currentUser: User | null;
}
