/**
 * 统一认证服务 - 提供多层次存储和优雅降级的认证状态管理
 */

import { createClient, SupabaseClient, Session, User, AuthChangeEvent, AuthError } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase';

// 存储类型
type StorageType = 'localStorage' | 'sessionStorage' | 'cookie' | 'memory';

// 存储键值对类型
interface StorageKeyValuePairs {
  [key: string]: string | boolean | number | undefined | null;
}

// AuthState类型
interface AuthState {
  isAuthenticated: boolean;
  lastAuthTime?: number | null;
  session: Session | null;
  user: User | null;
  userId?: string | null;
  email?: string | null;
  sessionId?: string | null;
  expiresAt?: number | null;
  error: Error | null;
}

interface StorageState {
  [key: string]: any;
}

// 存储键
const STORAGE_KEYS = {
  AUTH_STATE: 'auth_state',
  SESSION: 'session',
  USER: 'user',
  FALLBACK: 'auth_fallback'
} as const;

type AuthStateCallback = (state: AuthState) => void;

class AuthService {
  private static instance: AuthService | null = null;
  private supabase: SupabaseClient<Database>;
  private memoryAuthState: AuthState = {
    isAuthenticated: false,
    session: null,
    user: null,
    email: null,
    error: null
  };
  private subscribers: AuthStateCallback[] = [];
  private initialized: boolean = false;

  private constructor() {
    if (typeof window === 'undefined') {
      // 服务端使用基础配置
      this.supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      return;
    }

    // 客户端配置
    const storage = this.createMemoryStorage();
    
    this.supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          storageKey: 'sb-auth-token',
          storage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    );

    // 监听认证状态变化
    this.supabase.auth.onAuthStateChange(async (event, session) => {
      if (!this.initialized && event === 'INITIAL_SESSION') {
        this.initialized = true;
        return;
      }
      await this.handleAuthChange(event, session);
    });
  }

  private createMemoryStorage(): Storage {
    const storage: { [key: string]: string } = {};
    
    return {
      length: 0,
      clear() {
        Object.keys(storage).forEach(key => delete storage[key]);
      },
      getItem(key: string) {
        return storage[key] || null;
      },
      key(index: number) {
        return Object.keys(storage)[index] || null;
      },
      removeItem(key: string) {
        delete storage[key];
      },
      setItem(key: string, value: string) {
        storage[key] = value;
        // 如果是会话相关的数据，同时设置cookie
        if (key.includes('auth') || key.includes('session')) {
          try {
            document.cookie = `auth_valid=true; path=/; max-age=3600; SameSite=Lax`;
            document.cookie = `session_recovery=${encodeURIComponent(value)}; path=/; max-age=3600; SameSite=Lax`;
          } catch (e) {
            console.warn('[AuthService] 设置cookie失败:', e);
          }
        }
      }
    };
  }

  private async handleAuthChange(event: AuthChangeEvent, session: Session | null) {
    try {
      switch (event) {
        case 'SIGNED_IN':
          await this.updateAuthState({
            isAuthenticated: true,
            session,
            user: session?.user,
            email: session?.user?.email,
            error: null
          });
          break;
        case 'SIGNED_OUT':
          await this.updateAuthState({
            isAuthenticated: false,
            session: null,
            user: null,
            email: null,
            error: null
          });
          break;
        case 'TOKEN_REFRESHED':
          if (session) {
            await this.updateAuthState({
              session,
              error: null
            });
          }
          break;
      }
    } catch (error) {
      console.error('[AuthService] 处理认证状态变化时出错:', error);
      await this.handleError(error, 'handleAuthChange');
    }
  }

  private async updateAuthState(newState: Partial<AuthState>) {
    this.memoryAuthState = {
      ...this.memoryAuthState,
      ...newState
    };

    // 通知订阅者
    this.subscribers.forEach(callback => {
      try {
        callback(this.memoryAuthState);
      } catch (error) {
        console.error('[AuthService] 订阅者回调执行错误:', error);
      }
    });

    // 如果是登录状态，设置cookie
    if (newState.isAuthenticated && newState.session) {
      try {
        const sessionData = {
          access_token: newState.session.access_token,
          refresh_token: newState.session.refresh_token,
          user: {
            id: newState.session.user.id,
            email: newState.session.user.email
          }
        };
        document.cookie = `auth_valid=true; path=/; max-age=3600; SameSite=Lax`;
        document.cookie = `session_recovery=${encodeURIComponent(JSON.stringify(sessionData))}; path=/; max-age=3600; SameSite=Lax`;
      } catch (e) {
        console.warn('[AuthService] 设置认证cookie失败:', e);
      }
    }
  }

  private async handleError(error: unknown, context: string) {
    console.error(`[AuthService] ${context}:`, error);
    await this.updateAuthState({ error: error instanceof Error ? error : new Error(String(error)) });
  }

  public subscribe(callback: AuthStateCallback): () => void {
    this.subscribers.push(callback);
    callback(this.memoryAuthState);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  public isAuthenticated(): boolean {
    return this.memoryAuthState.isAuthenticated;
  }

  public getAuthState(): AuthState {
    return { ...this.memoryAuthState };
  }

  public getSupabaseClient(): SupabaseClient<Database> {
    return this.supabase;
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public async refreshSession(): Promise<Session | null> {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error) {
        console.error('[AuthService] 刷新会话失败:', error);
        return null;
      }
      return session;
    } catch (error) {
      console.error('[AuthService] 刷新会话时发生错误:', error);
      return null;
    }
  }

  public async forceSyncAuthState(): Promise<void> {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error) {
        console.error('[AuthService] 强制同步认证状态失败:', error);
        return;
      }
      
      await this.handleAuthChange(
        session ? 'SIGNED_IN' : 'SIGNED_OUT',
        session
      );
    } catch (error) {
      console.error('[AuthService] 强制同步认证状态时发生错误:', error);
    }
  }

  // 添加获取用户信息的方法
  public async getUserInfo() {
    try {
      // 首先尝试从内存状态获取
      if (this.memoryAuthState.user) {
        return {
          id: this.memoryAuthState.user.id,
          email: this.memoryAuthState.user.email,
          role: this.memoryAuthState.user.role,
          avatar_url: this.memoryAuthState.user.user_metadata?.avatar_url
        };
      }

      // 如果内存中没有，尝试从会话中获取
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error) {
        console.error('[AuthService] 获取用户会话失败:', error);
        return null;
      }

      if (!session?.user) {
        console.warn('[AuthService] 未找到有效的用户会话');
        return null;
      }

      // 更新内存状态
      await this.updateAuthState({
        user: session.user,
        email: session.user.email,
        isAuthenticated: true,
        session
      });

      return {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        avatar_url: session.user.user_metadata?.avatar_url
      };
    } catch (error) {
      console.error('[AuthService] 获取用户信息时发生错误:', error);
      return null;
    }
  }
}

// 创建单例实例
export const authService = AuthService.getInstance();

// 导出常用方法
export const getAuthState = () => authService.getAuthState();
export const isAuthenticated = () => authService.isAuthenticated();
export const signOut = async () => {
  const supabase = authService.getSupabaseClient();
  await supabase.auth.signOut();
};

// 添加缺失的导出函数
export const refreshSession = async (): Promise<Session | null> => {
  return await authService.refreshSession();
};

export const forceSyncAuthState = async (): Promise<void> => {
  await authService.forceSyncAuthState();
};

// 导出 getUserInfo 函数
export const getUserInfo = async () => {
  return await authService.getUserInfo();
};