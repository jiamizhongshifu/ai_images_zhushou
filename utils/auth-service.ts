/**
 * 统一认证服务 - 提供多层次存储和优雅降级的认证状态管理
 */

import { createClient, SupabaseClient, Session, User, AuthChangeEvent } from '@supabase/supabase-js'
import { Database } from '../types/supabase'
import { supabaseClient } from './supabase-client'

// 认证状态类型定义
export interface AuthState {
  isAuthenticated: boolean;
  lastAuthTime: number | undefined;
  expiresAt?: number;
  userId?: string;
  sessionId?: string;
  email?: string;
  user?: User | null;
  session?: Session | null;
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
  lastAuthTime: undefined,
  user: null,
  session: null
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

// AuthService 类型定义
export interface AuthServiceInterface {
  supabase: SupabaseClient<Database>;
  getSession(): Promise<Session | null>;
  refreshSession(): Promise<void>;
  handleAuthChange(event: AuthChangeEvent, session: Session | null): void;
  setAuthState(state: Partial<AuthState>): void;
  getAuthState(): AuthState;
  clearAuthState(): void;
  isAuthenticated(): boolean;
}

/**
 * 认证服务类 - 提供统一的认证状态管理
 */
export class AuthService implements AuthServiceInterface {
  public supabase = supabaseClient;
  private static instance: AuthService;
  private subscribers: Array<(state: AuthState) => void> = [];
  private isInitializing = false;
  private lastApiAuthCheck = 0;
  private apiAuthTTL = 60 * 1000; // 1分钟的API认证检查间隔
  private memoryAuthState: AuthState = DEFAULT_AUTH_STATE;
  
  // 添加登录保护期相关变量
  private loginProtectionEnabled = false;
  private loginProtectionExpiry = 0;
  private readonly LOGIN_PROTECTION_DURATION = 15000; // 15秒保护期

  constructor() {
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

  public handleAuthChange(event: AuthChangeEvent, session: Session | null): void {
    console.log('[AuthService] Auth state changed:', event, session);
    
    if (event === 'SIGNED_IN') {
      this.enableLoginProtection(); // 启用登录保护
      this.setAuthState({
        isAuthenticated: true,
        session,
        lastAuthTime: Date.now()
      });
      this.markSessionState(true);
    } else if (event === 'SIGNED_OUT') {
      this.setAuthState({
        isAuthenticated: false,
        session: null,
        lastAuthTime: Date.now()
      });
      this.markSessionState(false);
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
   * 设置认证状态并通知订阅者
   */
  public setAuthState(newState: Partial<AuthState>) {
    // 如果尝试设置未登录状态但处于保护期内，则忽略此次更新
    if (this.loginProtectionEnabled && 
        Date.now() < this.loginProtectionExpiry && 
        newState.isAuthenticated === false) {
      console.log('[AuthService] 登录保护期内，忽略未登录状态设置');
      return;
    }
    
    // 更新内存状态
    this.memoryAuthState = {
      ...this.memoryAuthState,
      ...newState
    };
    
    // 同步到全局memoryAuthState
    memoryAuthState = { ...this.memoryAuthState };
    
    // 只在客户端环境下进行存储操作
    if (this.isClientSide()) {
      try {
        // 使用storage辅助函数存储状态
        storage.setItem('authState', JSON.stringify(this.memoryAuthState));
        
        // 如果设置了认证状态，同时更新持久化存储
        if (newState.isAuthenticated !== undefined) {
          this.persistAuthState(newState.isAuthenticated);
          this.markSessionState(newState.isAuthenticated);
        }
      } catch (error) {
        console.warn('[AuthService] 存储认证状态失败:', error);
      }
    }
    
    // 通知所有订阅者
    this.notifySubscribers();
  }

  /**
   * 持久化认证状态
   */
  private persistAuthState(isAuthenticated: boolean): void {
    if (!this.isClientSide()) return;
    
    try {
      if (isAuthenticated) {
        storage.setItem(AUTH_STATE_KEY, JSON.stringify({ 
          isAuthenticated, 
          timestamp: Date.now() 
        }));
        
        // 清除登出标记
        storage.removeItem('force_logged_out');
        
        // 同时设置临时会话标记
        try {
          sessionStorage.setItem('temp_auth_state', 'true');
          sessionStorage.removeItem('isLoggedOut');
        } catch (e) {
          console.warn('[AuthService] 无法设置临时会话标记', e);
        }
      } else {
        // 清除认证状态
        storage.removeItem(AUTH_STATE_KEY);
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
  async refreshSession(): Promise<void> {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error || !session) {
        this.setAuthState({
          isAuthenticated: false,
          session: null,
          lastAuthTime: Date.now()
        });
        return;
      }
      
      this.setAuthState({
        isAuthenticated: true,
        session,
        lastAuthTime: Date.now()
      });
    } catch (error) {
      console.error('Failed to refresh session:', error);
      this.setAuthState({
        isAuthenticated: false,
        session: null,
        lastAuthTime: Date.now()
      });
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
        await this.refreshSession();
        // 重新检查会话状态
        if (!this.isAuthenticated()) {
          console.log('[AuthService] 刷新后仍未认证，尝试备用方法');
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
          await this.refreshSession();
          // 重新检查认证状态
          if (this.isAuthenticated()) {
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
   * 验证并更新会话状态
   * @param retryCount 重试次数
   */
  private async validateAndUpdateSession(retryCount = 0): Promise<void> {
    try {
      const url = new URL(window.location.href);
      const hasAuthSession = url.searchParams.has('auth_session');
      
      // 如果是新登录，启用登录保护
      if (hasAuthSession && retryCount === 0) {
        this.enableLoginProtection();
        console.log('[AuthService] 检测到新登录，等待会话建立');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error) {
        console.error('[AuthService] 获取会话出错:', error);
        if (retryCount < 5) {
          const delay = Math.min(1000 * (retryCount + 1), 5000);
          console.log(`[AuthService] 会话检查失败，${delay/1000}秒后重试(${retryCount + 1}/5)`);
          setTimeout(() => {
            this.validateAndUpdateSession(retryCount + 1);
          }, delay);
          return;
        }
      }
      
      if (!session) {
        // 如果处于登录保护期，则忽略无效会话结果
        if (this.loginProtectionEnabled && Date.now() < this.loginProtectionExpiry) {
          console.log('[AuthService] 登录保护期内，忽略无效会话结果');
          // 继续重试，直到保护期结束
          if (retryCount < 10) {
            setTimeout(() => {
              this.validateAndUpdateSession(retryCount + 1);
            }, 1000);
          }
          return;
        }
        
        if (hasAuthSession && retryCount < 5) {
          const delay = Math.min(1000 * (retryCount + 1), 5000);
          console.log(`[AuthService] 新会话未就绪，${delay/1000}秒后重试(${retryCount + 1}/5)`);
          setTimeout(() => {
            this.validateAndUpdateSession(retryCount + 1);
          }, delay);
          return;
        }
        
        // 如果是新登录但始终无法获取会话，保持已登录状态
        if (hasAuthSession) {
          console.log('[AuthService] 无法获取新会话，但保持登录状态');
          return;
        }
        
        console.log('[AuthService] 会话无效，设置未登录状态');
        this.setAuthState({
          isAuthenticated: false,
          lastAuthTime: Date.now()
        });
        return;
      }
      
      console.log('[AuthService] 会话有效，设置登录状态');
      this.setAuthState({
        isAuthenticated: true,
        session,
        lastAuthTime: Date.now()
      });
    } catch (error) {
      console.error('[AuthService] 检查会话状态失败:', error);
      if (retryCount < 5) {
        const delay = Math.min(1000 * (retryCount + 1), 5000);
        setTimeout(() => {
          this.validateAndUpdateSession(retryCount + 1);
        }, delay);
      }
    }
  }

  /**
   * 强制同步认证状态
   */
  public forceSyncAuthState(): void {
    console.log('[AuthService] 强制同步认证状态');
    
    if (!this.isClientSide()) {
      console.log('[AuthService] 服务器端环境，跳过状态同步');
      return;
    }
    
    try {
      // 检查URL中的auth_session参数
      const url = new URL(window.location.href);
      const hasAuthSession = url.searchParams.has('auth_session');
      
      if (hasAuthSession) {
        console.log('[AuthService] 检测到auth_session参数，设置认证状态并启用保护期');
        this.enableLoginProtection();
        this.setAuthState({
          isAuthenticated: true,
          lastAuthTime: Date.now()
        });
        
        // 延迟处理当前URL中的auth_session参数
        setTimeout(() => {
          // 清除URL中的auth_session参数，避免刷新重复处理
          if (window.history && window.history.replaceState) {
            const cleanUrl = url.toString().replace(/[\?&]auth_session=[^&]+/, '');
            window.history.replaceState({}, document.title, cleanUrl);
            console.log('[AuthService] 已清除URL中的auth_session参数');
          }
          
          // 延迟启动会话验证
          setTimeout(() => {
            this.validateAndUpdateSession();
          }, 2000);
        }, 1000);
        
        return;
      }
      
      // 检查本地存储状态
      const persistedState = storage.getItem(AUTH_STATE_KEY);
      const sessionState = sessionStorage.getItem('temp_auth_state');
      const forceLoggedOut = storage.getItem('force_logged_out') === 'true';
      const isLoggedOut = sessionStorage.getItem('isLoggedOut') === 'true';
      
      // 如果有登出标记，则强制设置未登录状态
      if (forceLoggedOut || isLoggedOut) {
        console.log('[AuthService] 检测到登出标记，设置未登录状态');
        this.setAuthState({
          isAuthenticated: false,
          lastAuthTime: Date.now()
        });
        return;
      }
      
      // 如果本地存储显示已登录
      if ((persistedState && JSON.parse(persistedState).isAuthenticated) || sessionState === 'true') {
        console.log('[AuthService] 本地存储显示已登录，同步状态');
        this.validateAndUpdateSession();
      }
    } catch (e) {
      console.warn('[AuthService] 强制同步认证状态失败:', e);
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

  async checkSession(): Promise<boolean> {
    await this.refreshSession();
    return this.isAuthenticated();
  }

  private enableLoginProtection() {
    this.loginProtectionEnabled = true;
    this.loginProtectionExpiry = Date.now() + this.LOGIN_PROTECTION_DURATION;
    console.log(`[AuthService] 已启用登录保护期，持续15秒，到期时间: ${new Date(this.loginProtectionExpiry).toISOString()}`);
  }

  private markSessionState(isAuthenticated: boolean) {
    try {
      const timestamp = Date.now();
      localStorage.setItem('last_auth_state', isAuthenticated ? 'true' : 'false');
      localStorage.setItem('last_auth_time', timestamp.toString());
    } catch (e) {
      console.warn('[AuthService] 无法写入会话状态标记', e);
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