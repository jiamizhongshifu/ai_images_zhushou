/**
 * 统一认证服务 - 提供多层次存储和优雅降级的认证状态管理
 */

import { createClient } from "@/utils/supabase/client";

// 认证状态类型定义
export interface AuthState {
  isAuthenticated: boolean;
  lastAuthTime: number;
  expiresAt?: number;
  userId?: string;
  sessionId?: string;
}

// 存储类型枚举
enum StorageType {
  MEMORY = 'memory',
  LOCAL_STORAGE = 'localStorage', 
  COOKIE = 'cookie'
}

// 默认认证状态
const DEFAULT_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  lastAuthTime: 0
};

// 认证状态存储键名
const AUTH_STATE_KEY = 'auth_state';
const AUTH_VALID_KEY = 'auth_valid';
const AUTH_TIME_KEY = 'auth_time';

// 内存中的认证状态缓存
let memoryAuthState: AuthState = { ...DEFAULT_AUTH_STATE };

/**
 * 认证服务类 - 提供统一的认证状态管理
 */
class AuthService {
  private static instance: AuthService;
  private subscribers: Array<(state: AuthState) => void> = [];
  private supabase = createClient();

  // 私有构造函数，确保单例
  private constructor() {
    this.initAuthState();
    // 监听认证状态变化
    this.setupAuthListener();
  }

  /**
   * 获取认证服务实例
   */
  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * 初始化认证状态
   */
  private initAuthState(): void {
    try {
      // 尝试从各种存储中读取认证状态
      const state = this.getStoredAuthState();
      if (state) {
        memoryAuthState = state;
        console.log('[AuthService] 已从存储中恢复认证状态');
      } else {
        console.log('[AuthService] 未找到存储的认证状态，使用默认状态');
      }
    } catch (error) {
      console.error('[AuthService] 初始化认证状态时出错:', error);
    }
  }

  /**
   * 设置 Supabase 认证监听器
   */
  private setupAuthListener(): void {
    try {
      const { data: authListener } = this.supabase.auth.onAuthStateChange(
        (event, session) => {
          console.log(`[AuthService] 认证状态变化: ${event}`);
          
          if (session?.user) {
            console.log(`[AuthService] 新会话用户: ${session.user.id.substring(0, 8)}...`);
            
            // 更新认证状态
            this.setAuthState({
              isAuthenticated: true,
              lastAuthTime: Date.now(),
              userId: session.user.id,
              sessionId: session.user.id, // 使用用户ID作为会话ID
              expiresAt: new Date(session.expires_at || '').getTime()
            });
          } else if (event === 'SIGNED_OUT') {
            console.log('[AuthService] 用户已登出');
            this.clearAuthState();
          }
        }
      );
    } catch (error) {
      console.error('[AuthService] 设置认证监听器时出错:', error);
    }
  }

  /**
   * 获取当前认证状态
   */
  public getAuthState(): AuthState {
    // 始终返回内存中的状态
    return { ...memoryAuthState };
  }

  /**
   * 检查用户是否已认证
   */
  public isAuthenticated(): boolean {
    // 检查内存中的状态
    if (memoryAuthState.isAuthenticated) {
      // 如果设置了过期时间，检查是否已过期
      if (memoryAuthState.expiresAt && Date.now() > memoryAuthState.expiresAt) {
        console.log('[AuthService] 认证已过期');
        this.clearAuthState();
        return false;
      }
      return true;
    }
    
    // 尝试从传统存储中读取
    try {
      // 检查localStorage是否有手动存储的认证标记
      const isLegacyAuthenticated = this.checkLegacyAuth();
      if (isLegacyAuthenticated) {
        // 将旧的认证数据转换为新格式
        this.migrateToNewAuthFormat();
        return true;
      }
    } catch (error) {
      console.warn('[AuthService] 检查传统认证状态时出错:', error);
    }
    
    return false;
  }

  /**
   * 检查传统认证方式
   */
  private checkLegacyAuth(): boolean {
    try {
      // 尝试读取localStorage中的旧格式认证信息
      let localAuth;
      let localAuthTime;
      
      try {
        localAuth = localStorage.getItem(AUTH_VALID_KEY);
        localAuthTime = localStorage.getItem(AUTH_TIME_KEY);
      } catch (e) {
        console.warn('[AuthService] 访问localStorage失败:', e);
        return false;
      }
      
      if (localAuth === 'true' && localAuthTime) {
        const authTime = parseInt(localAuthTime, 10);
        const now = Date.now();
        // 如果认证时间在24小时内，认为有效
        if (now - authTime < 24 * 60 * 60 * 1000) {
          console.log("[AuthService] 本地存储中发现有效的传统认证");
          return true;
        }
      }
      
      // 检查cookie是否存在
      const hasSBCookie = document.cookie.includes('sb-access-token') || 
                         document.cookie.includes('sb-refresh-token');
                         
      if (hasSBCookie) {
        console.log("[AuthService] 检测到认证cookie存在");
        return true;
      }
    } catch (error) {
      console.warn('[AuthService] 检查传统认证时出错:', error);
    }
    
    return false;
  }

  /**
   * 将旧的认证格式迁移到新格式
   */
  private migrateToNewAuthFormat(): void {
    try {
      const authTime = localStorage.getItem(AUTH_TIME_KEY);
      const lastAuthTime = authTime ? parseInt(authTime, 10) : Date.now();
      
      // 创建新的认证状态
      const newState: AuthState = {
        isAuthenticated: true,
        lastAuthTime: lastAuthTime,
        // 无法从旧格式获取这些值，留空
        userId: undefined,
        sessionId: undefined,
        expiresAt: lastAuthTime + (24 * 60 * 60 * 1000) // 默认24小时过期
      };
      
      // 设置新的认证状态
      this.setAuthState(newState);
      console.log('[AuthService] 已将传统认证格式迁移到新格式');
    } catch (error) {
      console.error('[AuthService] 迁移认证格式时出错:', error);
    }
  }

  /**
   * 设置认证状态
   */
  public setAuthState(state: Partial<AuthState>): void {
    // 更新内存中的状态
    memoryAuthState = {
      ...memoryAuthState,
      ...state,
      lastAuthTime: state.lastAuthTime || Date.now()
    };
    
    // 尝试保存到各种存储
    this.saveAuthState(memoryAuthState);
    
    // 通知订阅者
    this.notifySubscribers();
    
    // 兼容旧的认证格式
    this.updateLegacyAuth(memoryAuthState.isAuthenticated);
  }

  /**
   * 更新传统认证状态
   */
  private updateLegacyAuth(isAuthenticated: boolean): void {
    try {
      if (isAuthenticated) {
        // 设置传统认证标记
        this.setStorage(StorageType.LOCAL_STORAGE, AUTH_VALID_KEY, 'true');
        this.setStorage(StorageType.LOCAL_STORAGE, AUTH_TIME_KEY, Date.now().toString());
      } else {
        // 清除传统认证标记
        this.removeStorage(StorageType.LOCAL_STORAGE, AUTH_VALID_KEY);
        this.removeStorage(StorageType.LOCAL_STORAGE, AUTH_TIME_KEY);
      }
    } catch (error) {
      console.warn('[AuthService] 更新传统认证状态时出错:', error);
    }
  }

  /**
   * 清除认证状态
   */
  public clearAuthState(): void {
    // 重置内存状态
    memoryAuthState = { ...DEFAULT_AUTH_STATE };
    
    // 清除各种存储
    this.removeStorage(StorageType.LOCAL_STORAGE, AUTH_STATE_KEY);
    this.removeStorage(StorageType.LOCAL_STORAGE, AUTH_VALID_KEY);
    this.removeStorage(StorageType.LOCAL_STORAGE, AUTH_TIME_KEY);
    
    // 清除Supabase相关的Cookie和localStorage
    this.clearSupabaseAuth();
    
    // 通知订阅者
    this.notifySubscribers();
    
    console.log('[AuthService] 认证状态已清除');
  }
  
  /**
   * 清除Supabase认证相关的Cookie和localStorage
   */
  private clearSupabaseAuth(): void {
    try {
      // 清除localStorage中的Supabase认证数据
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('supabase.auth.expires_at');
      localStorage.removeItem('wasAuthenticated');
      
      // 清除相关Cookie
      this.clearCookies(['sb-access-token', 'sb-refresh-token', '__session']);
      
      console.log('[AuthService] Supabase认证数据已清除');
    } catch (error) {
      console.warn('[AuthService] 清除Supabase认证数据时出错:', error);
    }
  }
  
  /**
   * 清除指定的Cookie
   */
  private clearCookies(cookieNames: string[]): void {
    try {
      const commonOptions = '; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      
      cookieNames.forEach(cookieName => {
        // 尝试在所有可能的域上清除cookie
        document.cookie = `${cookieName}=${commonOptions}`;
        document.cookie = `${cookieName}=${commonOptions}; domain=${window.location.hostname}`;
        
        // 尝试在根域上清除
        const domainParts = window.location.hostname.split('.');
        if (domainParts.length > 1) {
          const rootDomain = domainParts.slice(domainParts.length - 2).join('.');
          document.cookie = `${cookieName}=${commonOptions}; domain=.${rootDomain}`;
        }
        
        console.log(`[AuthService] 已尝试清除Cookie: ${cookieName}`);
      });
    } catch (error) {
      console.warn('[AuthService] 清除Cookie时出错:', error);
    }
  }

  /**
   * 从存储中读取认证状态
   */
  private getStoredAuthState(): AuthState | null {
    // 优先从localStorage读取
    try {
      const stateStr = localStorage.getItem(AUTH_STATE_KEY);
      if (stateStr) {
        return JSON.parse(stateStr) as AuthState;
      }
    } catch (error) {
      console.warn('[AuthService] 从localStorage读取认证状态时出错:', error);
    }
    
    // 从传统存储中读取
    const isLegacyAuthenticated = this.checkLegacyAuth();
    if (isLegacyAuthenticated) {
      try {
        const authTime = localStorage.getItem(AUTH_TIME_KEY);
        const lastAuthTime = authTime ? parseInt(authTime, 10) : Date.now();
        
        return {
          isAuthenticated: true,
          lastAuthTime: lastAuthTime,
          expiresAt: lastAuthTime + (24 * 60 * 60 * 1000) // 默认24小时过期
        };
      } catch (error) {
        console.warn('[AuthService] 读取传统认证时间时出错:', error);
      }
    }
    
    return null;
  }

  /**
   * 保存认证状态到存储
   */
  private saveAuthState(state: AuthState): void {
    try {
      // 保存到localStorage
      this.setStorage(StorageType.LOCAL_STORAGE, AUTH_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[AuthService] 保存认证状态时出错:', error);
    }
  }

  /**
   * 设置存储键值对
   */
  private setStorage(type: StorageType, key: string, value: string): void {
    try {
      switch (type) {
        case StorageType.LOCAL_STORAGE:
          localStorage.setItem(key, value);
          break;
          
        // 其他存储类型可以在这里添加
        
        default:
          break;
      }
    } catch (error) {
      console.warn(`[AuthService] 设置${type}存储时出错:`, error);
    }
  }

  /**
   * 从存储中移除键
   */
  private removeStorage(type: StorageType, key: string): void {
    try {
      switch (type) {
        case StorageType.LOCAL_STORAGE:
          localStorage.removeItem(key);
          break;
          
        // 其他存储类型可以在这里添加
        
        default:
          break;
      }
    } catch (error) {
      console.warn(`[AuthService] 从${type}存储中移除时出错:`, error);
    }
  }

  /**
   * 刷新认证会话
   */
  public async refreshSession(): Promise<boolean> {
    try {
      console.log('[AuthService] 尝试刷新会话');
      
      const { data, error } = await this.supabase.auth.refreshSession();
      
      if (error) {
        console.error('[AuthService] 刷新会话出错:', error);
        return false;
      }
      
      if (data.session) {
        console.log('[AuthService] 会话刷新成功');
        // 自动通过onAuthStateChange处理
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[AuthService] 刷新会话异常:', error);
      return false;
    }
  }

  /**
   * 手动设置认证状态
   * 用于处理特殊情况，如直接访问
   */
  public manualAuthenticate(): void {
    this.setAuthState({
      isAuthenticated: true,
      lastAuthTime: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24小时过期
    });
    console.log('[AuthService] 已手动设置认证状态');
  }

  /**
   * 订阅认证状态变化
   */
  public subscribe(callback: (state: AuthState) => void): () => void {
    this.subscribers.push(callback);
    
    // 立即通知当前状态
    callback(this.getAuthState());
    
    // 返回取消订阅函数
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  /**
   * 通知所有订阅者
   */
  private notifySubscribers(): void {
    const state = this.getAuthState();
    this.subscribers.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('[AuthService] 通知订阅者时出错:', error);
      }
    });
  }

  /**
   * 获取用户信息
   */
  public async getUserInfo(): Promise<any> {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();
      
      if (error) {
        console.error('[AuthService] 获取用户信息出错:', error);
        return null;
      }
      
      return user;
    } catch (error) {
      console.error('[AuthService] 获取用户信息异常:', error);
      return null;
    }
  }

  /**
   * 登出
   */
  public async signOut(): Promise<boolean> {
    try {
      console.log('[AuthService] 开始登出操作');
      
      // 先清除本地状态，确保前端UI立即响应
      this.clearAuthState();
      
      try {
        // 尝试记录登出状态到会话存储
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('logging_out', 'true');
        }
      } catch (e) {
        console.warn('[AuthService] 无法写入会话存储:', e);
      }
      
      // 执行Supabase登出（这是一个API操作，可能失败，但不影响前端状态）
      try {
        const { error } = await this.supabase.auth.signOut();
        if (error) {
          console.error('[AuthService] Supabase登出API调用出错:', error);
          return false;
        }
      } catch (apiError) {
        console.error('[AuthService] Supabase登出API异常:', apiError);
        return false;
      }
      
      console.log('[AuthService] 登出成功');
      return true;
    } catch (error) {
      console.error('[AuthService] 登出异常:', error);
      
      // 确保即使出错也清除本地状态
      try {
        this.clearAuthState();
      } catch (e) {
        console.error('[AuthService] 清除认证状态失败:', e);
      }
      
      return false;
    }
  }
}

// 导出单例实例
export const authService = AuthService.getInstance();

// 导出快捷方法
export const isAuthenticated = () => authService.isAuthenticated();
export const getAuthState = () => authService.getAuthState();
export const refreshSession = () => authService.refreshSession();
export const signOut = () => authService.signOut(); 