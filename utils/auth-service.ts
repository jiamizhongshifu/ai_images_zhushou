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
  email?: string;
  lastVerified?: number;
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

// 为认证状态添加缓存
const AUTH_CACHE_KEY = 'auth_state';
const AUTH_CACHE_VALID_KEY = 'auth_valid';
const AUTH_CACHE_TIME_KEY = 'auth_time';

// 认证状态有效期（毫秒）
const AUTH_CACHE_TTL = 10 * 60 * 1000; // 10分钟

// 内存中的认证状态缓存
let memoryAuthState: AuthState = { ...DEFAULT_AUTH_STATE };
// 标记是否已检查过服务器会话
let hasCheckedServerSession = false;
// 标记是否由于存储问题而降级到API验证
let isDegradedToApiAuth = false;

// Cookie操作辅助函数
const cookieHelper = {
  set: (name: string, value: string, days = 1): void => {
    try {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      const expires = `expires=${date.toUTCString()}`;
      document.cookie = `${name}=${value};${expires};path=/;SameSite=Lax`;
    } catch (error) {
      console.warn('[Cookie] 设置Cookie失败:', error);
    }
  },
  
  get: (name: string): string | null => {
    try {
      const nameEQ = `${name}=`;
      const ca = document.cookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
      }
      return null;
    } catch (error) {
      console.warn('[Cookie] 获取Cookie失败:', error);
      return null;
    }
  },
  
  delete: (name: string): void => {
    try {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
    } catch (error) {
      console.warn('[Cookie] 删除Cookie失败:', error);
    }
  }
};

// 增强的存储访问函数，包含多级降级策略
const storage = {
  setItem: (key: string, value: string): void => {
    try {
      // 尝试localStorage
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('[Storage] localStorage访问失败，降级到Cookie:', error);
      // 降级到Cookie
      try {
        cookieHelper.set(key, value);
        isDegradedToApiAuth = true;
      } catch (innerError) {
        console.error('[Storage] 所有存储方法均失败:', innerError);
      }
    }
  },
  
  getItem: (key: string): string | null => {
    try {
      // 尝试localStorage
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('[Storage] localStorage访问失败，尝试Cookie:', error);
      // 降级到Cookie
      try {
        const value = cookieHelper.get(key);
        isDegradedToApiAuth = true;
        return value;
      } catch (innerError) {
        console.error('[Storage] 所有存储方法均失败:', innerError);
        return null;
      }
    }
  },
  
  removeItem: (key: string): void => {
    try {
      // 尝试localStorage
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('[Storage] localStorage访问失败，尝试删除Cookie:', error);
      // 降级到Cookie
      try {
        cookieHelper.delete(key);
      } catch (innerError) {
        console.error('[Storage] 所有存储方法均失败:', innerError);
      }
    }
  }
};

// 增强的缓存有效性检查
const isAuthCacheValid = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  try {
    // 优先检查内存状态
    if (memoryAuthState.isAuthenticated && 
        memoryAuthState.lastAuthTime && 
        Date.now() - memoryAuthState.lastAuthTime < AUTH_CACHE_TTL) {
      return true;
    }
    
    // 然后检查持久化存储
    const isValid = storage.getItem(AUTH_CACHE_VALID_KEY) === 'true';
    if (!isValid) return false;
    
    const timestamp = parseInt(storage.getItem(AUTH_CACHE_TIME_KEY) || '0', 10);
    const now = Date.now();
    
    // 检查缓存是否过期
    if (now - timestamp > AUTH_CACHE_TTL) {
      console.log('[AuthService] 认证缓存已过期');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[AuthService] 检查认证缓存时出错:', error);
    isDegradedToApiAuth = true;
    return false;
  }
};

// 延迟标记，用于控制并发会话刷新请求
let isRefreshingSession = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * 认证服务类 - 提供统一的认证状态管理
 */
class AuthService {
  private static instance: AuthService;
  private subscribers: Array<(state: AuthState) => void> = [];
  private supabase = createClient();
  private isInitializing = false;
  private lastApiAuthCheck = 0;
  private apiAuthTTL = 60 * 1000; // 1分钟的API认证检查间隔

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
  private async initAuthState(): Promise<void> {
    try {
      this.isInitializing = true;
      // 尝试从各种存储中读取认证状态
      const state = this.getStoredAuthState();
      if (state) {
        memoryAuthState = state;
        console.log('[AuthService] 已从存储中恢复认证状态');
      } else {
        console.log('[AuthService] 未找到存储的认证状态，使用默认状态');
      }

      // 主动检查 Supabase 会话状态
      if (this.isClientSide() && !hasCheckedServerSession) {
        console.log('[AuthService] 主动检查 Supabase 会话状态');
        await this.checkServerSession();
      }
    } catch (error) {
      console.error('[AuthService] 初始化认证状态时出错:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * 主动检查服务器会话状态
   */
  private async checkServerSession(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.auth.getSession();
      
      if (error) {
        console.error('[AuthService] 获取会话失败:', error.message);
        return false;
      }
      
      hasCheckedServerSession = true;
      
      if (data && data.session) {
        const session = data.session;
        console.log(`[AuthService] 检测到有效会话，用户 ID: ${session.user.id.substring(0, 8)}...`);
        
        // 更新认证状态
        this.setAuthState({
          isAuthenticated: true,
          lastAuthTime: Date.now(),
          userId: session.user.id,
          sessionId: session.user.id,
          email: session.user.email,
          expiresAt: new Date(session.expires_at || '').getTime(),
          lastVerified: Date.now()
        });
        
        return true;
      }
      
      console.log('[AuthService] 无有效会话');
      return false;
    } catch (error) {
      console.error('[AuthService] 检查服务器会话时出错:', error);
      return false;
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
              sessionId: session.user.id,
              email: session.user.email,
              expiresAt: new Date(session.expires_at || '').getTime(),
              lastVerified: Date.now()
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
   * 从各种存储中读取认证状态
   */
  private getStoredAuthState(): AuthState | null {
    try {
      // 优先从内存读取
      if (memoryAuthState.isAuthenticated) {
        return memoryAuthState;
      }
      
      // 然后尝试localStorage/Cookie
      const storedStateJson = storage.getItem(AUTH_STATE_KEY);
      if (storedStateJson) {
        try {
          return JSON.parse(storedStateJson);
        } catch (parseError) {
          console.error('[AuthService] 解析存储的认证状态失败:', parseError);
        }
      }
      
      return null;
    } catch (error) {
      console.error('[AuthService] 读取存储的认证状态时出错:', error);
      return null;
    }
  }

  /**
   * 设置认证状态
   */
  private setAuthState(partialState: Partial<AuthState>): void {
    try {
      // 更新内存状态
      const newState: AuthState = {
        ...memoryAuthState,
        ...partialState,
        lastAuthTime: Date.now() // 总是更新时间戳
      };
      
      memoryAuthState = newState;
      
      // 尝试持久化存储
      try {
        const stateJson = JSON.stringify(newState);
        storage.setItem(AUTH_STATE_KEY, stateJson);
        
        // 更新缓存有效性标记
        storage.setItem(AUTH_CACHE_VALID_KEY, 'true');
        storage.setItem(AUTH_CACHE_TIME_KEY, Date.now().toString());
      } catch (storageError) {
        console.warn('[AuthService] 持久化存储认证状态失败:', storageError);
      }
      
      // 通知订阅者
      this.notifySubscribers();
    } catch (error) {
      console.error('[AuthService] 设置认证状态时出错:', error);
    }
  }

  /**
   * 清除认证状态
   */
  private clearAuthState(): void {
    try {
      // 重置内存状态
      memoryAuthState = { ...DEFAULT_AUTH_STATE };
      
      // 清除存储
      try {
        storage.removeItem(AUTH_STATE_KEY);
        storage.removeItem(AUTH_CACHE_VALID_KEY);
        storage.removeItem(AUTH_CACHE_TIME_KEY);
      } catch (storageError) {
        console.warn('[AuthService] 清除存储的认证状态失败:', storageError);
      }
      
      // 通知订阅者
      this.notifySubscribers();
    } catch (error) {
      console.error('[AuthService] 清除认证状态时出错:', error);
    }
  }

  /**
   * 检查是否为客户端环境
   */
  private isClientSide(): boolean {
    return typeof window !== 'undefined';
  }

  /**
   * 检查用户是否已认证
   * @returns 是否已认证
   */
  public isAuthenticated(): boolean {
    // 在服务器端始终返回false
    if (!this.isClientSide()) return false;
    
    try {
      // 检查登出标记
      try {
        // 先检查登出标记
        const forceLoggedOut = storage.getItem('force_logged_out') === 'true';
        const isLoggedOut = typeof sessionStorage !== 'undefined' && 
          sessionStorage.getItem('isLoggedOut') === 'true';
        
        if (forceLoggedOut || isLoggedOut) {
          console.log('[AuthService] 检测到登出标记，状态为未登录');
          return false;
        }
      } catch (storageError) {
        console.warn('[AuthService] 检查登出标记失败，忽略:', storageError);
      }
      
      // 优先检查内存中的状态
      if (memoryAuthState.isAuthenticated) {
        return true;
      }
      
      // 如果处于降级模式或缓存无效，则需要通过API验证
      const now = Date.now();
      if ((isDegradedToApiAuth || !isAuthCacheValid()) && 
          now - this.lastApiAuthCheck > this.apiAuthTTL) {
        
        // 更新上次检查时间，避免频繁API调用
        this.lastApiAuthCheck = now;
        
        // 触发异步会话刷新，但不等待它完成
        setTimeout(() => {
          this.checkServerSession().catch(console.error);
        }, 0);
      }
      
      // 返回当前内存中的状态(可能在上面的异步验证后被更新)
      return memoryAuthState.isAuthenticated;
    } catch (error) {
      console.error('[AuthService] 检查认证状态时出错:', error);
      
      // 发生错误时，触发API验证作为恢复措施
      setTimeout(() => {
        this.checkServerSession().catch(console.error);
      }, 0);
      
      // 返回当前内存中的状态
      return memoryAuthState.isAuthenticated;
    }
  }

  /**
   * 刷新会话
   * @returns 是否成功刷新会话
   */
  async refreshSession(): Promise<boolean> {
    console.log('[AuthService] 尝试刷新会话');
    
    // 如果已经有刷新请求在进行中，复用那个Promise
    if (isRefreshingSession && refreshPromise) {
      console.log('[AuthService] 已有刷新请求在进行中，复用现有Promise');
      return refreshPromise;
    }
    
    isRefreshingSession = true;
    refreshPromise = (async () => {
      try {
        // 如果内存状态已认证且未过期，直接返回成功
        if (memoryAuthState.isAuthenticated && 
            memoryAuthState.expiresAt && 
            memoryAuthState.expiresAt > Date.now()) {
          console.log('[AuthService] 内存中有有效会话，跳过API刷新');
          return true;
        }
        
        // 创建Supabase客户端
        const supabase = createClient();
        
        // 先检查当前会话
        const sessionResult = await supabase.auth.getSession();
        if (sessionResult.data?.session) {
          console.log('[AuthService] 获取到有效会话，无需刷新');
          
          const session = sessionResult.data.session;
          this.setAuthState({
            isAuthenticated: true,
            lastVerified: Date.now(),
            userId: session.user.id,
            email: session.user.email,
            expiresAt: new Date(session.expires_at || '').getTime()
          });
          
          return true;
        }
        
        // 如果没有有效会话，尝试刷新
        console.log('[AuthService] 无有效会话，尝试刷新会话');
        const { data, error } = await supabase.auth.refreshSession();
        
        if (error) {
          // 如果是会话丢失错误，尝试自动降级到getUserInfo
          if (error.message?.includes('Auth session missing')) {
            console.log('[AuthService] 会话丢失，尝试获取用户信息');
            const userInfo = await this.getUserInfo();
            
            if (userInfo) {
              console.log('[AuthService] 通过用户信息恢复会话');
              this.setAuthState({ 
                isAuthenticated: true,
                userId: userInfo.id,
                email: userInfo.email
              });
              return true;
            } else {
              console.log('[AuthService] 用户信息获取失败，认证失败');
              this.setAuthState({ isAuthenticated: false });
              return false;
            }
          } else {
            console.error('[AuthService] 刷新会话失败:', error.message);
            this.setAuthState({ isAuthenticated: false });
            return false;
          }
        }
        
        if (data && data.session) {
          console.log('[AuthService] 会话刷新成功');
          this.setAuthState({
            isAuthenticated: true,
            lastVerified: Date.now(),
            userId: data.session.user.id,
            email: data.session.user.email,
            expiresAt: new Date(data.session.expires_at || '').getTime()
          });
          
          return true;
        } else {
          console.log('[AuthService] 会话刷新后无效');
          this.setAuthState({ isAuthenticated: false });
          return false;
        }
      } catch (error) {
        console.error('[AuthService] 刷新会话过程中出错:', error);
        
        // 尝试通过用户信息恢复作为最后手段
        try {
          const userInfo = await this.getUserInfo();
          if (userInfo) {
            console.log('[AuthService] 通过用户信息恢复会话(错误恢复)');
            this.setAuthState({ 
              isAuthenticated: true,
              userId: userInfo.id,
              email: userInfo.email
            });
            return true;
          }
        } catch (innerError) {
          console.error('[AuthService] 恢复尝试也失败:', innerError);
        }
        
        this.setAuthState({ isAuthenticated: false });
        return false;
      } finally {
        // 重置标记，允许下一次刷新
        setTimeout(() => {
          isRefreshingSession = false;
          refreshPromise = null;
        }, 1000); // 1秒后才允许新的刷新请求
      }
    })();
    
    return refreshPromise;
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