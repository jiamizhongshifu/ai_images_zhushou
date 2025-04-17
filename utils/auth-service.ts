/**
 * 统一认证服务 - 提供多层次存储和优雅降级的认证状态管理
 */

import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js'
import { Database } from '../types/supabase'

// 认证状态类型定义
export interface AuthState {
  isAuthenticated: boolean;
  lastAuthTime: number | undefined;
  expiresAt?: number;
  userId?: string;
  sessionId?: string;
  email?: string;
  lastVerified?: number;
  user?: User;
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
const AUTH_STATE_KEY = 'auth_state_persistent';
const AUTH_VALID_KEY = 'auth_valid';
const AUTH_TIME_KEY = 'auth_time';
const SESSION_STATE_KEY = 'session_state';

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
    // 服务器端直接返回，不执行任何Cookie操作
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    
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
    // 服务器端直接返回null，不执行任何Cookie操作
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return null;
    }
    
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
    // 服务器端直接返回，不执行任何Cookie操作
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    
    try {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
    } catch (error) {
      console.warn('[Cookie] 删除Cookie失败:', error);
    }
  }
};

// 增强的存储访问函数，包含多级降级策略和服务器端安全检查
const storage = {
  setItem: (key: string, value: string): void => {
    // 服务器端直接返回，不执行任何存储操作
    if (typeof window === 'undefined') {
      console.log('[Storage] 服务器端环境，跳过存储操作');
      return;
    }
    
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
    // 服务器端直接返回null，不执行任何存储操作
    if (typeof window === 'undefined') {
      return null;
    }
    
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
    // 服务器端直接返回，不执行任何存储操作
    if (typeof window === 'undefined') {
      return;
    }
    
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

// 添加新的持久化存储键
const AUTH_SESSION_TOKEN_KEY = 'sb-auth-token-persistent';

/**
 * 认证服务类 - 提供统一的认证状态管理
 */
export class AuthService {
  private static instance: AuthService;
  private subscribers: Array<(state: AuthState) => void> = [];
  private supabase: SupabaseClient<Database>;
  private isInitializing = false;
  private lastApiAuthCheck = 0;
  private apiAuthTTL = 60 * 1000; // 1分钟的API认证检查间隔

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
    this.initAuthState();
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
      console.log('[AuthService] 开始初始化认证状态');

      // 检查是否有强制登出标记
      if (this.checkForcedLogoutState()) {
        console.log('[AuthService] 检测到强制登出标记，设置未登录状态');
        this.setAuthState({ isAuthenticated: false });
        return;
      }

      // 检查会话状态
      const { data: { session } } = await this.supabase.auth.getSession();
      const isAuthenticated = !!session;
      
      console.log('[AuthService] 会话检查结果:', isAuthenticated ? '已登录' : '未登录');
      
      // 同步更新所有存储
      this.setAuthState({ 
        isAuthenticated,
        lastAuthTime: isAuthenticated ? Date.now() : undefined
      });

      // 设置监听器
      this.supabase.auth.onAuthStateChange((event, session) => {
        console.log('[AuthService] 认证状态变化:', event);
        this.handleAuthChange(event, session);
      });

    } catch (error) {
      console.error('[AuthService] 初始化认证状态出错:', error);
      this.setAuthState({ isAuthenticated: false });
    } finally {
      this.isInitializing = false;
    }
  }

  private handleAuthChange(event: string, session: Session | null): void {
    console.log('[AuthService] 处理认证状态变化:', event, session);
    
    switch (event) {
      case 'SIGNED_IN':
        if (session) {
          this.setAuthState({ 
            isAuthenticated: true,
            lastAuthTime: Date.now(),
            userId: session.user.id,
            email: session.user.email || undefined,
            user: session.user
          });
        }
        break;
      case 'SIGNED_OUT':
        this.setAuthState({ 
          isAuthenticated: false,
          lastAuthTime: undefined,
          userId: undefined,
          email: undefined,
          user: undefined
        });
        break;
      case 'TOKEN_REFRESHED':
        if (session) {
          this.setAuthState({ 
            isAuthenticated: true,
            lastAuthTime: Date.now(),
            userId: session.user.id,
            email: session.user.email || undefined,
            user: session.user
          });
        }
        break;
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
   * 检查强制登出标记
   */
  private checkForcedLogoutState(): boolean {
    try {
      const forcedLogout = localStorage.getItem('force_logged_out') === 'true' ||
                          sessionStorage.getItem('isLoggedOut') === 'true';
      return forcedLogout;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * 持久化认证状态
   */
  private persistAuthState(isAuthenticated: boolean): void {
    if (!this.isClientSide()) return;
    
    try {
      if (isAuthenticated) {
        localStorage.setItem(AUTH_STATE_KEY, JSON.stringify({ 
          isAuthenticated, 
          timestamp: Date.now() 
        }));
        
        // 清除登出标记
        localStorage.removeItem('force_logged_out');
        
        // 同时设置临时会话标记
        try {
          sessionStorage.setItem('temp_auth_state', 'true');
          sessionStorage.removeItem('isLoggedOut');
        } catch (e) {
          console.warn('[AuthService] 无法设置临时会话标记', e);
        }
      } else {
        // 清除认证状态
        localStorage.removeItem(AUTH_STATE_KEY);
        try {
          sessionStorage.removeItem('temp_auth_state');
        } catch (e) {
          console.warn('[AuthService] 无法清除临时会话标记', e);
        }
      }
    } catch (e) {
      console.error('[AuthService] 持久化认证状态出错:', e);
    }
  }

  /**
   * 设置认证状态并通知订阅者
   */
  private setAuthState(state: Partial<AuthState>): void {
    console.log('[AuthService] 设置认证状态:', state);
    
    // 更新内存状态
    memoryAuthState = { 
      ...memoryAuthState, 
      ...state,
      lastAuthTime: state.isAuthenticated ? (state.lastAuthTime || Date.now()) : undefined
    };

    // 同步到localStorage
    try {
      localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(memoryAuthState));
      sessionStorage.setItem(SESSION_STATE_KEY, memoryAuthState.isAuthenticated ? 'true' : 'false');
    } catch (e) {
      console.warn('[AuthService] 保存认证状态到存储失败:', e);
    }

    // 通知订阅者
    this.notifySubscribers();
  }

  /**
   * 清除认证状态
   */
  public clearAuthState(): boolean {
    try {
      // 先清除内存状态
      memoryAuthState = { ...DEFAULT_AUTH_STATE };
      
      // 清除所有持久化存储
      try {
        localStorage.removeItem(AUTH_STATE_KEY);
        sessionStorage.removeItem(SESSION_STATE_KEY);
        localStorage.removeItem(AUTH_VALID_KEY);
        localStorage.removeItem(AUTH_TIME_KEY);
        sessionStorage.removeItem(AUTH_VALID_KEY);
        sessionStorage.removeItem(AUTH_TIME_KEY);
        
        // 清除可能存在的其他认证相关存储
        localStorage.removeItem('sb-auth-token-persistent');
        sessionStorage.removeItem('sb-auth-token');
        
        // 设置登出标记
        localStorage.setItem('force_logged_out', 'true');
        sessionStorage.setItem('isLoggedOut', 'true');
      } catch (e) {
        console.warn('[AuthService] 清除持久化存储失败:', e);
      }
      
      // 通知所有订阅者
      this.notifySubscribers();
      
      return true;
    } catch (error) {
      console.error('[AuthService] 清除认证状态失败:', error);
      return false;
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
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error || !session) {
        console.log('[AuthService] 刷新会话失败:', error?.message || '无会话');
        this.setAuthState({ 
          isAuthenticated: false,
          lastAuthTime: 0
        });
        return false;
      }

      this.setAuthState({ 
        isAuthenticated: true,
        lastAuthTime: Date.now()
      });
      return true;
    } catch (error) {
      console.error('[AuthService] 刷新会话时出错:', error);
      this.setAuthState({ 
        isAuthenticated: false,
        lastAuthTime: 0
      });
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
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  /**
   * 通知所有订阅者
   */
  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(memoryAuthState));
  }

  /**
   * 获取用户信息
   */
  public async getUserInfo(): Promise<any> {
    try {
      console.log('[AuthService] 尝试获取用户信息');
      
      // 先检查当前会话
      const { data: sessionData, error: sessionError } = await this.supabase.auth.getSession();
      
      if (sessionError) {
        console.error('[AuthService] 获取会话出错:', sessionError);
        return this.tryRecoverUserInfo();
      }
      
      if (!sessionData.session) {
        console.log('[AuthService] 没有有效会话，尝试刷新');
        const refreshed = await this.refreshSession();
        if (!refreshed) {
          console.log('[AuthService] 刷新会话失败，尝试备用方法');
          return this.tryRecoverUserInfo();
        }
      }
      
      // 尝试获取用户信息
      const { data: { user }, error } = await this.supabase.auth.getUser();
      
      if (error) {
        console.error('[AuthService] 获取用户信息出错:', error);
        
        // 如果是会话缺失错误，尝试刷新会话后重试
        if (error.message?.includes('Auth session missing')) {
          console.log('[AuthService] 检测到会话缺失错误，尝试刷新会话');
          const refreshed = await this.refreshSession();
          if (refreshed) {
            // 重新获取用户信息
            try {
              const { data: retryData } = await this.supabase.auth.getUser();
              if (retryData.user) {
                console.log('[AuthService] 刷新会话后成功获取用户信息');
                return retryData.user;
              }
            } catch (retryError) {
              console.error('[AuthService] 重试获取用户信息失败:', retryError);
            }
          }
        }
        
        return this.tryRecoverUserInfo();
      }
      
      if (user) {
        console.log(`[AuthService] 成功获取用户信息: ${user.id.substring(0, 8)}...`);
        return user;
      } else {
        console.log('[AuthService] 无法获取用户信息，API返回空值');
        return this.tryRecoverUserInfo();
      }
    } catch (error) {
      console.error('[AuthService] 获取用户信息异常:', error);
      return this.tryRecoverUserInfo();
    }
  }
  
  /**
   * 尝试通过其他方式恢复用户信息
   * 作为getUserInfo的后备方案
   */
  private async tryRecoverUserInfo(): Promise<any> {
    try {
      console.log('[AuthService] 尝试通过备用方法恢复用户信息');
      
      // 尝试从本地存储获取认证状态
      const authState = this.getStoredAuthState();
      if (authState && authState.userId) {
        console.log('[AuthService] 从存储的认证状态恢复用户ID:', authState.userId);
        return {
          id: authState.userId,
          email: authState.email || 'unknown',
          // 提供最小的用户数据结构
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString()
        };
      }
      
      // 尝试通过API状态检查获取用户状态
      try {
        // 使用fetch直接调用API，避免Supabase客户端依赖
        if (typeof fetch !== 'undefined') {
          const response = await fetch('/api/auth/status', {
            credentials: 'include',
            headers: {
              'Cache-Control': 'no-cache, no-store',
              'Pragma': 'no-cache'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.authenticated && data.userId) {
              console.log('[AuthService] 通过状态API成功获取用户ID');
              return {
                id: data.userId,
                email: 'recovered@user.id',
                app_metadata: {},
                user_metadata: {},
                aud: 'authenticated',
                created_at: new Date().toISOString()
              };
            }
          }
        }
      } catch (apiError) {
        console.error('[AuthService] 通过API获取用户状态失败:', apiError);
      }
      
      console.log('[AuthService] 所有恢复尝试均失败');
      return null;
    } catch (error) {
      console.error('[AuthService] 尝试恢复用户信息异常:', error);
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

  /**
   * 强制同步认证状态
   * 用于解决组件间认证状态不同步的问题
   */
  public forceSyncAuthState(): void {
    console.log('[AuthService] 强制同步认证状态');
    
    // 检查本地存储状态
    try {
      const persistedState = localStorage.getItem(AUTH_STATE_KEY);
      const sessionState = sessionStorage.getItem(SESSION_STATE_KEY);
      
      if ((persistedState && JSON.parse(persistedState).isAuthenticated) || sessionState === 'true') {
        // 本地存储显示已登录，但内存状态可能不同步
        if (!memoryAuthState.isAuthenticated) {
          console.log('[AuthService] 本地存储显示已登录，但内存状态未同步，正在更新');
          this.setAuthState({
            isAuthenticated: true,
            lastAuthTime: Date.now()
          });
        }
      } else {
        // 本地存储显示未登录，但内存状态可能仍显示登录
        if (memoryAuthState.isAuthenticated) {
          console.log('[AuthService] 本地存储显示未登录，但内存状态仍显示登录，正在更新');
          this.setAuthState({
            isAuthenticated: false,
            lastAuthTime: Date.now()
          });
        }
      }
      
      // 确保状态一致，通知所有订阅者
      this.notifySubscribers();
    } catch (e) {
      console.warn('[AuthService] 强制同步认证状态失败:', e);
    }
  }

  /**
   * 刷新会话状态
   */
  public async refreshSessionStatus(): Promise<boolean> {
    // 先检查本地存储，确保状态一致
    this.forceSyncAuthState();
    
    // 如果本地存储显示未登录，则无需进行API请求
    const persistedState = localStorage.getItem(AUTH_STATE_KEY);
    const sessionState = sessionStorage.getItem(SESSION_STATE_KEY);
    
    if (!persistedState && sessionState !== 'true') {
      console.log('[AuthService] 本地存储显示未登录，跳过会话刷新');
      return false;
    }
    
    // 继续进行正常的会话刷新流程
    try {
      // 如果已有刷新请求进行中，返回该请求的结果
      if (isRefreshingSession && refreshPromise) {
        console.log('[AuthService] 会话刷新已在进行中，复用现有请求');
        return refreshPromise;
      }
      
      isRefreshingSession = true;
      refreshPromise = (async () => {
        try {
          console.log('[AuthService] 开始刷新会话状态');
          
          // 检查本地缓存是否有效
          if (isAuthCacheValid()) {
            console.log('[AuthService] 认证缓存有效，跳过API请求');
            return memoryAuthState.isAuthenticated;
          }
          
          // 通过API检查会话状态
          const isValid = await this.checkServerSession();
          console.log(`[AuthService] 服务器会话检查结果: ${isValid ? '有效' : '无效'}`);
          
          // 如果会话无效但内存状态仍为已认证，则清除认证状态
          if (!isValid && memoryAuthState.isAuthenticated) {
            console.log('[AuthService] 会话无效但内存状态为已认证，清除认证状态');
            this.clearAuthState();
            return false;
          }
          
          return isValid;
        } catch (error) {
          console.error('[AuthService] 刷新会话状态失败:', error);
          
          // 保守策略：出错时不更改当前认证状态
          return memoryAuthState.isAuthenticated;
        } finally {
          isRefreshingSession = false;
          refreshPromise = null;
        }
      })();
      
      return await refreshPromise;
    } catch (error) {
      console.error('[AuthService] 启动会话刷新失败:', error);
      isRefreshingSession = false;
      refreshPromise = null;
      return memoryAuthState.isAuthenticated;
    }
  }

  public async getSession(): Promise<Session | null> {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error) {
        console.error('[AuthService] 获取会话失败:', error);
        return null;
      }
      
      return session;
    } catch (error) {
      console.error('[AuthService] 获取会话时出错:', error);
      return null;
    }
  }

  async checkServerSession(): Promise<boolean> {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error || !session) {
        return false;
      }
      return true;
    } catch (error) {
      console.error('[AuthService] 检查服务器会话时出错:', error);
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
export const clearAuthState = () => authService.clearAuthState();
export const forceSyncAuthState = () => authService.forceSyncAuthState(); 