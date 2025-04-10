import { create } from 'zustand';

// 用户状态类型定义
interface UserState {
  credits: number | null;
  loading: boolean;
  resetUser: () => void;
}

// 认证状态类型定义
interface AuthState {
  isAuthenticated: boolean;
  setAuth: (auth: boolean) => void;
}

// 创建用户状态管理
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useUserStore = create<UserState>((set: any) => ({
  credits: null, // 用户点数
  loading: false, // 加载状态
  resetUser: () => set({ credits: null, loading: false }) // 重置用户状态
}));

// 创建认证状态管理
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useUserAuth = create<AuthState>((set: any) => ({
  isAuthenticated: false, // 是否已认证
  setAuth: (auth: boolean) => set({ isAuthenticated: auth }) // 设置认证状态
}));

export default {
  useUserStore,
  useUserAuth
}; 