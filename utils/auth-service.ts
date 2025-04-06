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

// 内存中的认证状态缓存
let memoryAuthState: AuthState = { ...DEFAULT_AUTH_STATE };
// 标记是否已检查过服务器会话
let hasCheckedServerSession = false;

/**
 * 认证服务类 - 提供统一的认证状态管理
 */
class AuthService {
  private static instance: AuthService;
  private subscribers: Array<(state: AuthState) => void> = [];
  private supabase = createClient();
  private isInitializing = false;

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

      // 新增：主动检查 Supabase 会话状态
      if (this.isClientSide() && !hasCheckedServerSession) {
        console.log('[AuthService] 主动检查 Supabase 会话状态');
        this.checkServerSession();
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
  private async checkServerSession(): Promise<void> {
    try {
      const { data, error } = await this.supabase.auth.getSession();
      
      if (error) {
        console.error('[AuthService] 获取会话失败:', error.message);
        return;
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
        
        return;
      }
      
      console.log('[AuthService] 无有效会话');
    } catch (error) {
      console.error('[AuthService] 检查服务器会话时出错:', error);
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
   * 检查用户是否已认证
   */
  public isAuthenticated(): boolean {
    // 如果正在初始化，等待初始化完成
    if (this.isInitializing) {
      console.log('[AuthService] 正在初始化，暂时返回当前状态');
      return memoryAuthState.isAuthenticated;
    }

    // 检查内存中的状态
    if (memoryAuthState.isAuthenticated) {
      // 如果设置了过期时间，检查是否已过期
      if (memoryAuthState.expiresAt && Date.now() > memoryAuthState.expiresAt) {
        console.log('[AuthService] 认证已过期');
        this.clearAuthState();
        return false;
      }
      
      // 如果最后验证时间超过30分钟，尝试刷新会话
      const thirtyMinutes = 30 * 60 * 1000;
      if (memoryAuthState.lastVerified && (Date.now() - memoryAuthState.lastVerified > thirtyMinutes)) {
        console.log('[AuthService] 最后验证时间已超过30分钟，尝试刷新会话');
        // 异步刷新会话，不阻塞当前请求
        this.refreshSession().catch(err => {
          console.warn('[AuthService] 刷新会话失败:', err);
        });
      }
      
      return true;
    }
    
    // 如果没有检查过服务器会话，主动检查
    if (this.isClientSide() && !hasCheckedServerSession) {
      console.log('[AuthService] 未检查过服务器会话，主动检查');
      // 异步检查会话，不阻塞当前请求
      this.checkServerSession().catch(err => {
        console.warn('[AuthService] 检查服务器会话失败:', err);
      });
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
   * 安全检查客户端环境
   * 防止在服务器端执行时出错
   */
  private isClientSide(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined' && typeof document !== 'undefined';
  }

  /**
   * 检查传统认证方式
   */
  private checkLegacyAuth(): boolean {
    // 服务器端直接返回false
    if (!this.isClientSide()) {
      return false;
    }
    
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
    if (!this.isClientSide()) {
      return;
    }
    
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
    if (!this.isClientSide()) {
      return;
    }
    
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
    if (!this.isClientSide()) {
      return;
    }
    
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
    // 服务器端直接返回null
    if (!this.isClientSide()) {
      return null;
    }
    
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
    if (!this.isClientSide()) {
      return;
    }
    
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
    if (!this.isClientSide()) {
      return;
    }
    
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
    if (!this.isClientSide()) {
      return;
    }
    
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
   * 刷新会话
   * 尝试多种方式恢复用户会话
   */
  public async refreshSession(): Promise<boolean> {
    console.log('[AuthService] 开始刷新会话');
    
    // 记录开始时间，用于计算耗时
    const startTime = Date.now();
    
    try {
      // 首先检查内存中的认证状态
      if (this.isAuthenticated()) {
        console.log('[AuthService] 内存中已有有效认证状态');
        return true;
      }
      
      // 尝试从存储中恢复状态
      const storedState = this.getStoredAuthState();
      if (storedState && storedState.isAuthenticated && storedState.userId) {
        console.log('[AuthService] 从本地存储恢复成功');
        memoryAuthState = storedState;
        this.notifySubscribers();
        return true;
      }
      
      // 尝试直接从Supabase刷新会话
      let result = false;
      
      // 实现指数退避重试 - 最多尝试3次
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          console.log(`[AuthService] 尝试刷新Supabase会话 (尝试 ${attempt + 1}/3)`);
          const { data, error } = await this.supabase.auth.refreshSession();
          
          if (error) {
            console.warn(`[AuthService] 刷新会话失败 (尝试 ${attempt + 1}/3):`, error.message);
            
            // 检查是否是会话不存在的错误
            if (error.message.includes('not found') || error.message.includes('expired')) {
              console.log('[AuthService] 会话不存在或已过期，停止重试');
              break;
            }
            
            // 如果不是最后一次尝试，等待后重试
            if (attempt < 2) {
              const delay = Math.pow(2, attempt) * 1000; // 指数退避: 1s, 2s, 4s
              console.log(`[AuthService] 等待 ${delay}ms 后重试`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            continue;
          }
          
          // 获取到会话信息
          if (data.session) {
            console.log('[AuthService] Supabase会话刷新成功:', data.session.expires_at);
            
            // 更新内存中的认证状态
            this.setAuthState({
              isAuthenticated: true,
              lastAuthTime: Date.now(),
              userId: data.session.user.id,
              email: data.session.user.email || '',
              sessionId: data.session.user.id,
              expiresAt: new Date(data.session.expires_at || '').getTime()
            });
            
            result = true;
            break; // 成功，退出重试循环
          } else {
            console.warn('[AuthService] Supabase返回了空会话');
          }
        } catch (err) {
          console.error(`[AuthService] 刷新会话过程中出错 (尝试 ${attempt + 1}/3):`, err);
          
          // 如果不是最后一次尝试，等待后重试
          if (attempt < 2) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // 记录耗时
      const duration = Date.now() - startTime;
      console.log(`[AuthService] 会话刷新${result ? '成功' : '失败'}, 耗时 ${duration}ms`);
      
      return result;
    } catch (error) {
      console.error('[AuthService] 刷新会话过程中发生异常:', error);
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