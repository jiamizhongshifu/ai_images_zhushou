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
  private memoryAuthState: AuthState & StorageState = {
  isAuthenticated: false,
    session: null,
    user: null,
    email: null,
    error: null
  };
  private subscribers: AuthStateCallback[] = [];
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<void> | null = null;
  private storageType: StorageType = 'memory';
  private initialized: boolean = false;
  // 添加会话验证尝试次数记录
  private sessionValidationAttempts: number = 0;
  private lastSessionValidationTime: number = 0;
  // 添加标识是否正在进行手动会话验证
  private isManuallyCheckingSession: boolean = false;

  // 添加内部方法来验证和更新会话，增强服务端验证
  private async validateAndUpdateSession(): Promise<boolean> {
    try {
      // 先检查内存中的会话状态
      if (this.memoryAuthState.isAuthenticated && this.memoryAuthState.session) {
        console.log('[AuthService] 内存中已有有效会话，跳过验证');
        return true;
      }
      
      // 尝试从cookie中恢复认证状态
      const hasCookieAuth = typeof document !== 'undefined' && 
                            document.cookie.includes('user_authenticated=true');
                            
      // 检查URL参数
      const hasAuthSessionParam = typeof window !== 'undefined' && 
                                 window.location.search.includes('auth_session');
      
      // 首先尝试通过Supabase客户端获取会话
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error) {
        console.error('[AuthService] 验证会话时出错:', error.message);
      }
      
      // 如果常规验证找到了会话
      if (session) {
        console.log('[AuthService] Supabase会话验证成功，用户ID:', session.user.id);
        await this.handleAuthChange('SIGNED_IN', session);
        this.sessionValidationAttempts = 0;
        return true;
      } 
      
      // 常规验证失败但有Cookie认证标记，尝试服务器端验证
      if ((hasCookieAuth || hasAuthSessionParam) && !this.isManuallyCheckingSession) {
        console.log('[AuthService] 常规验证失败但发现认证标记，尝试服务器端验证');
        this.isManuallyCheckingSession = true;
        
        try {
          // 调用服务器端验证API
          const response = await fetch('/api/auth/incognito-session', {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
              console.log('[AuthService] 服务器端会话验证成功');
              
              // 创建一个模拟会话对象
              const mockSession = {
                access_token: 'recovered_session',
                expires_in: 3600,
                refresh_token: 'recovered_refresh',
                token_type: 'bearer',
                user: {
                  id: data.userId || 'unknown',
                  email: data.email || 'unknown@example.com',
                  app_metadata: {},
                  user_metadata: {},
                  aud: 'authenticated',
                  created_at: new Date().toISOString()
                }
              } as unknown as Session;
              
              // 更新认证状态
              await this.handleAuthChange('SIGNED_IN', mockSession);
              
              // 设置认证cookie，确保刷新后仍然可以保持会话
              document.cookie = `user_authenticated=true; path=/; max-age=3600; SameSite=Lax`;
              document.cookie = `session_verified=true; path=/; max-age=3600; SameSite=Lax`;
              
              this.sessionValidationAttempts = 0;
              this.isManuallyCheckingSession = false;
              return true;
            }
          }
        } catch (serverError) {
          console.error('[AuthService] 服务器端会话验证失败:', serverError);
        } finally {
          this.isManuallyCheckingSession = false;
        }
      }
      
      // 所有验证方法都失败，更新状态为未登录
      console.warn('[AuthService] 会话验证失败，无有效会话');
      await this.handleAuthChange('SIGNED_OUT', null);
      return false;
    } catch (error) {
      console.error('[AuthService] 会话验证过程中出错:', error);
      await this.handleError(error, 'validateAndUpdateSession');
      this.isManuallyCheckingSession = false;
      return false;
    }
  }

  private constructor() {
    // 确定可用的存储类型
    this.determineStorageType();
    
    // 确保只在客户端创建实例
    if (typeof window !== 'undefined') {
      const storageAdapter = this.getStorageAdapter();
      
      // 使用单一配置创建 Supabase 客户端
      this.supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            storageKey: 'sb-auth-token',
            storage: storageAdapter,
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

      // 恢复持久化的状态
      this.restorePersistedState();
      
      // 检查URL中是否存在auth_session参数
      if (typeof window !== 'undefined' && window.location.search.includes('auth_session')) {
        console.log('[AuthService] 检测到auth_session参数，将在1秒后验证会话状态');
        // 延迟检查会话，给服务器端足够时间处理会话
        setTimeout(() => {
          this.refreshSession();
        }, 1000);
      }
    } else {
      // 服务端使用基础配置
      this.supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
    }
  }

  private determineStorageType(): void {
    try {
      // 检查是否在浏览器扩展环境或无痕模式中
      // 调整扩展环境检测逻辑，减少误判
      let isExtensionContext = false;
      
      if (typeof window !== 'undefined') {
        // 仅当URL明确包含chrome-extension时才认为是扩展环境
        isExtensionContext = window.location.href.indexOf('chrome-extension://') === 0 || 
                            window.location.href.indexOf('moz-extension://') === 0;
                           
        // 检查扩展API是否可用，但仅作为辅助判断，不作为主要依据
        // @ts-ignore - chrome 可能存在于扩展环境
        const hasExtensionApi = typeof window.chrome !== 'undefined' && 
                              // @ts-ignore
                              typeof window.chrome.runtime !== 'undefined' &&
                              // @ts-ignore
                              typeof window.chrome.runtime.id !== 'undefined';
                              
        // 如果检测到扩展API，在控制台记录，但不仅凭此判断为扩展环境
        if (hasExtensionApi && !isExtensionContext) {
          console.warn('[AuthService] 检测到扩展API但URL不是扩展格式，不视为扩展环境');
        }
      }
      
      // 检测是否可能是无痕模式
      let isIncognito = false;
      try {
        if (typeof window !== 'undefined') {
          // 尝试写入和读取localStorage测试
          localStorage.setItem('incognito_test', 'test');
          const testValue = localStorage.getItem('incognito_test');
          
          // 如果能写入但读取为null或与写入值不匹配，可能是无痕模式
          isIncognito = testValue !== 'test';
          try {
            localStorage.removeItem('incognito_test');
          } catch (e) {
            // 忽略清理错误
          }
          
          // 尝试检测是否有localStorage配额限制(Safari无痕模式的特点)
          try {
            const storage = { data: 'x'.repeat(1024) }; // 1KB测试，避免太大导致正常模式也触发
            localStorage.setItem('size_test', JSON.stringify(storage));
            localStorage.removeItem('size_test');
          } catch (e) {
            // 如果抛出配额错误，很可能是无痕模式
            isIncognito = true;
          }
        }
      } catch (e) {
        // 如果访问localStorage时出错，视为无痕模式
        console.warn('[AuthService] localStorage访问失败:', e);
        isIncognito = true;
      }
      
      // 在浏览器控制台记录检测结果
      if (typeof window !== 'undefined') {
        console.log(`[AuthService] 环境检测结果: 扩展环境=${isExtensionContext}, 无痕模式=${isIncognito}`);
      }
      
      // 如果是扩展环境或无痕模式，使用内存存储，但增加警告
      if (isExtensionContext || isIncognito) {
        if (isExtensionContext) {
          console.warn('[AuthService] 检测到浏览器扩展环境，使用内存存储');
        } else {
          console.warn('[AuthService] 检测到无痕模式，使用内存存储');
        }
        this.storageType = 'memory';
        
        // 尝试设置特殊cookie标记告知中间件
        if (typeof document !== 'undefined') {
          try {
            document.cookie = 'storage_limitation=true; path=/; max-age=3600; SameSite=Lax';
        } catch (e) {
            // 忽略cookie设置错误
          }
        }
        return;
      }
      
      // 标准环境检测逻辑
      // 尝试使用localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem('storage_test', 'test');
          localStorage.removeItem('storage_test');
          this.storageType = 'localStorage';
          console.log('[AuthService] 使用localStorage存储');
          return;
    } catch (e) {
          console.warn('[AuthService] localStorage不可用:', e);
        }
      }
      
      // 尝试使用sessionStorage
      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          sessionStorage.setItem('storage_test', 'test');
          sessionStorage.removeItem('storage_test');
          this.storageType = 'sessionStorage';
          console.log('[AuthService] 使用sessionStorage存储');
          return;
        } catch (e) {
          console.warn('[AuthService] sessionStorage不可用:', e);
        }
      }
      
      // 降级到cookie，如果可用
      if (typeof document !== 'undefined') {
        try {
          document.cookie = 'storage_test=test; path=/';
          if (document.cookie.indexOf('storage_test') !== -1) {
            document.cookie = 'storage_test=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            this.storageType = 'cookie';
            console.log('[AuthService] 使用cookie存储');
            return;
          }
        } catch (e) {
          console.warn('[AuthService] cookie不可用:', e);
        }
      }

      // 所有存储方式都不可用，使用内存存储
      this.storageType = 'memory';
      console.warn('[AuthService] 所有持久化存储都不可用，使用内存存储');
    } catch (e) {
      // 出现任何错误时，降级到内存存储
      this.storageType = 'memory';
      console.warn('[AuthService] 确定存储类型时出错，使用内存存储:', e);
    }
  }

  // 在无痕模式或扩展环境中使用的全局内存存储
  private static globalMemoryStorage: { [key: string]: string } = {};

  private getStorageAdapter() {
    // 使用类的静态属性来存储，这样在页面重载时也能保持一致
    const memoryStorage = AuthService.globalMemoryStorage;
    
    return {
      getItem: (key: string): string | null => {
        try {
          // 对于Supabase认证相关的键，始终使用内存存储
          if (key.startsWith('sb-') || this.storageType === 'memory') {
            return memoryStorage[key] || null;
          }
          
          // 尝试从其他存储获取
          try {
            if (this.storageType === 'localStorage') {
              return localStorage.getItem(key);
            } else if (this.storageType === 'sessionStorage') {
              return sessionStorage.getItem(key);
            } else if (this.storageType === 'cookie') {
              const cookies = document.cookie.split(';');
              for (const cookie of cookies) {
                const [cookieName, cookieValue] = cookie.trim().split('=');
                if (cookieName === key) {
                  return decodeURIComponent(cookieValue);
                }
              }
      return null;
    }
          } catch (e) {
            console.warn('[AuthService] 从存储读取失败:', e);
          }
          
          // 返回内存中的值作为后备
          return memoryStorage[key] || null;
    } catch (e) {
          console.warn('[AuthService] 存储读取失败:', e);
          return null;
        }
      },
      setItem: (key: string, value: string): void => {
        try {
          // 对于Supabase认证相关的键，始终保存到内存存储中
          if (key.startsWith('sb-') || this.storageType === 'memory') {
            memoryStorage[key] = value;
            
            // 如果是会话数据，额外处理
            if (key === 'sb-auth-token' || key.includes('session')) {
              // 尝试提取会话数据并存储到cookie中
              try {
                let sessionData = value;
                // 如果是JSON，解析后获取令牌
                try {
                  const parsed = JSON.parse(value);
                  if (parsed && parsed.access_token) {
                    sessionData = parsed.access_token;
      }
        } catch (e) {
                  // 非JSON，直接使用原始值
                }
                
                // 设置cookie以帮助中间件识别登录状态
                document.cookie = `user_authenticated=true; path=/; max-age=86400; SameSite=Lax`;
                document.cookie = `session_verified=true; path=/; max-age=3600; SameSite=Lax`;
                
                // 立即清除所有登出标记
                const cookiesToClear = ['force_logged_out', 'isLoggedOut', 'auth_logged_out', 'logged_out'];
                cookiesToClear.forEach(name => {
                  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
                });
    } catch (e) {
                console.warn('[AuthService] 处理会话数据失败:', e);
              }
            }
            return;
          }
          
          // 尝试存储到其他存储
          try {
            if (this.storageType === 'localStorage') {
              localStorage.setItem(key, value);
            } else if (this.storageType === 'sessionStorage') {
              sessionStorage.setItem(key, value);
            } else if (this.storageType === 'cookie') {
              document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=86400; SameSite=Lax`;
            }
      } catch (e) {
            console.warn('[AuthService] 存储到存储失败:', e);
            // 降级到内存存储
            memoryStorage[key] = value;
          }
      } catch (e) {
          console.warn('[AuthService] 存储写入失败:', e);
          // 确保即使在错误情况下也能存储
          try {
            memoryStorage[key] = value;
          } catch (innerError) {
            console.error('[AuthService] 无法写入内存存储:', innerError);
          }
        }
      },
      removeItem: (key: string): void => {
        try {
          // 从内存存储中删除
          if (key in memoryStorage) {
            delete memoryStorage[key];
          }
          
          // 如果不是内存存储模式，也从其他存储中删除
          if (this.storageType !== 'memory') {
            try {
              if (this.storageType === 'localStorage') {
                localStorage.removeItem(key);
              } else if (this.storageType === 'sessionStorage') {
                sessionStorage.removeItem(key);
              } else if (this.storageType === 'cookie') {
                document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
              }
      } catch (e) {
              console.warn('[AuthService] 从存储删除失败:', e);
            }
          }
        } catch (e) {
          console.warn('[AuthService] 存储删除失败:', e);
        }
      }
    };
  }

  private async handleAuthChange(event: AuthChangeEvent, session: Session | null) {
    console.log(`[AuthService] 认证状态变化: ${event}`, session?.user?.email);
    
      const now = Date.now();
    
    try {
      switch (event) {
        case 'SIGNED_IN':
          await this.updateAuthState({
            isAuthenticated: true,
            lastAuthTime: now,
            session,
            user: session?.user,
            userId: session?.user?.id,
            email: session?.user?.email,
            sessionId: session?.access_token,
            expiresAt: session ? now + (session.expires_in || 3600) * 1000 : undefined,
            error: null
          });
          break;
        case 'SIGNED_OUT':
          await this.updateAuthState({
            isAuthenticated: false,
            lastAuthTime: now,
            session: null,
            user: null,
            userId: undefined,
            email: null,
            sessionId: undefined,
            expiresAt: undefined,
            error: null
          });
          break;
        case 'TOKEN_REFRESHED':
          if (session) {
            await this.updateAuthState({
              session,
              lastAuthTime: now,
              expiresAt: now + (session.expires_in || 3600) * 1000,
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

  private async handleError(error: unknown, context: string): Promise<void> {
    if (error instanceof AuthError) {
      console.error(`[AuthService] ${context}:`, error.message);
      await this.updateAuthState({ error });
    } else if (error instanceof Error) {
      console.error(`[AuthService] ${context}:`, error.message);
      await this.updateAuthState({ error: null });
    } else {
      console.error(`[AuthService] ${context}: Unknown error`, error);
      await this.updateAuthState({ error: null });
    }
  }

  private async updateAuthState(newState: Partial<AuthState>) {
    // 创建新的认证状态
    const updatedState: AuthState = {
      ...this.memoryAuthState,
      ...newState,
      lastAuthTime: Date.now()
    };

    // 更新内存状态，保持 StorageState 部分不变
    this.memoryAuthState = {
      ...this.memoryAuthState, // 保留现有的 StorageState 数据
      ...updatedState,         // 更新 AuthState 部分
    };
    
    // 转换为存储格式
    const storageState = {
      isAuthenticated: updatedState.isAuthenticated,
      lastAuthTime: updatedState.lastAuthTime,
      user: updatedState.user,
      session: updatedState.session,
      error: updatedState.error ? updatedState.error.message : null
    };

    // 更新存储
    try {
      await this.setItem(STORAGE_KEYS.AUTH_STATE, JSON.stringify(storageState));
    } catch (error) {
      console.warn('[AuthService] 状态持久化失败:', error);
    }

    // 通知订阅者
    this.subscribers.forEach(callback => callback(updatedState));
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => {
      try {
        callback(this.memoryAuthState);
      } catch (error) {
        console.error('[AuthService] 订阅者回调执行错误:', error);
      }
    });
  }

  private restorePersistedState(): void {
    try {
      const storedState = localStorage.getItem(STORAGE_KEYS.AUTH_STATE);
      if (storedState) {
        const parsedState = JSON.parse(storedState);
        this.memoryAuthState = {
          ...this.memoryAuthState,
          ...parsedState
        };
        this.notifySubscribers();
      }
    } catch (error) {
      console.warn('[AuthService] 恢复持久化状态失败:', error);
    }
  }

  public subscribe(callback: AuthStateCallback): () => void {
    this.subscribers.push(callback);
    // 立即触发一次回调，同步当前状态
    callback(this.memoryAuthState);
    
    // 返回取消订阅函数
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

  /**
   * 获取Supabase客户端实例
   * 用于直接操作Supabase
   */
  public getSupabaseClient(): SupabaseClient<Database> {
    return this.supabase;
  }

  // 修改refreshSession方法，添加延迟和重试机制
  public async refreshSession(): Promise<void> {
    // 如果已经在刷新中，直接返回现有Promise
    if (this.isRefreshing) {
      return this.refreshPromise!;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        // 检查是否需要添加重试逻辑
        const now = Date.now();
        const needsRetry = (
          // URL中包含auth_session参数表示刚刚登录，或者cookie中有认证标记
          (typeof window !== 'undefined' && 
           (window.location.search.includes('auth_session') || 
            document.cookie.includes('user_authenticated=true'))) && 
          // 尝试次数小于5次 - 增加重试次数
          this.sessionValidationAttempts < 5 &&
          // 距离上次验证至少间隔1秒
          (now - this.lastSessionValidationTime) > 1000
        );
        
        // 记录本次验证时间
        this.lastSessionValidationTime = now;
        
        // 执行会话验证
        const valid = await this.validateAndUpdateSession();
        
        // 如果验证失败且需要重试
        if (!valid && needsRetry) {
          this.sessionValidationAttempts++;
          console.log(`[AuthService] 会话验证失败，将在1秒后进行第${this.sessionValidationAttempts}次重试`);
          
          // 释放当前锁，以便重试可以创建新的Promise
          this.isRefreshing = false;
          this.refreshPromise = null;
          
          // 延迟1秒后重试
          setTimeout(() => {
            this.refreshSession();
          }, 1000);
          
          // 检查如果已经重试了3次以上，尝试刷新页面以重新获取会话
          if (this.sessionValidationAttempts >= 3 && 
              typeof window !== 'undefined' && 
              window.location.search.includes('auth_session')) {
            console.log('[AuthService] 多次重试仍然失败，建议刷新页面');
          }
      } else {
          // 验证成功或不需要重试，重置状态
          this.sessionValidationAttempts = valid ? 0 : this.sessionValidationAttempts;
      }
    } catch (error) {
        await this.handleError(error, 'refreshSession');
      } finally {
        // 如果不是因为需要重试而延迟释放锁，则在这里释放
        if (this.isRefreshing) {
          this.isRefreshing = false;
          this.refreshPromise = null;
        }
      }
    })();

    return this.refreshPromise;
  }

  public async forceSyncAuthState(): Promise<void> {
    // 重置重试计数，确保强制同步时可以进行完整的重试
    this.sessionValidationAttempts = 0;
    
    // 如果有auth_session参数，增加额外的延迟
    if (typeof window !== 'undefined' && window.location.search.includes('auth_session')) {
      console.log('[AuthService] 强制同步认证状态，延迟1秒');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    await this.refreshSession();
  }

  /**
   * 清除认证状态
   * 登出时使用此方法重置所有状态
   */
  public async clearAuthState(): Promise<void> {
    try {
      // 重置内存中的认证状态
      await this.updateAuthState({
            isAuthenticated: false,
        session: null,
        user: null,
        userId: null,
        email: null,
        sessionId: null,
        expiresAt: null,
        error: null
      });

      // 清除所有可能存在的身份验证令牌
      if (typeof window !== 'undefined') {
        try {
          // 清除 localStorage 中的认证数据
          localStorage.removeItem('sb-auth-token');
          localStorage.removeItem('auth_state_persistent');
          localStorage.removeItem('supabase.auth.token');
          localStorage.removeItem('sb-refresh-token');
          localStorage.removeItem('sb-access-token');
          
          // 清除 sessionStorage 中的认证数据
          sessionStorage.removeItem('temp_auth_state');
          sessionStorage.removeItem('sb-auth-token');
          
          // 通过设置过期时间为过去，清除认证相关 cookie
          document.cookie = 'sb-refresh-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          document.cookie = 'sb-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      } catch (e) {
          console.warn('[AuthService] 清除存储失败:', e);
        }
      }
      
      console.log('[AuthService] 认证状态已清除');
    } catch (error) {
      console.error('[AuthService] 清除认证状态失败:', error);
      throw error;
    }
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private async setItem(key: string, value: string): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      switch (this.storageType) {
        case 'localStorage':
          localStorage.setItem(key, value);
          break;
        case 'sessionStorage':
          sessionStorage.setItem(key, value);
          break;
        case 'cookie':
          document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=86400; SameSite=Lax`;
          break;
        case 'memory':
          // 内存存储时不需要额外操作，因为已经在 memoryAuthState 中了
          break;
      }
    } catch (error) {
      console.error('[AuthService] 存储项设置失败:', error);
      throw error; // 向上传播错误以便调用者处理
    }
  }

  public async getUserInfo(): Promise<User | null> {
    try {
      // 首先检查内存中的用户信息
      if (this.memoryAuthState.user) {
        return this.memoryAuthState.user;
      }

      // 如果内存中没有，尝试从 Supabase 获取
      const { data: { user }, error } = await this.supabase.auth.getUser();
      
      if (error) {
        console.error('[AuthService] 获取用户信息失败:', error.message);
        return null;
      }
      
      if (user) {
        // 更新内存状态
        await this.updateAuthState({
          user,
          userId: user.id,
          email: user.email
        });
        return user;
      }
      
      return null;
        } catch (error) {
      console.error('[AuthService] getUserInfo 执行出错:', error);
      return null;
    }
  }
}

// 创建单例实例
export const authService = AuthService.getInstance();

// 导出常用方法
export const refreshSession = () => authService.refreshSession();
export const forceSyncAuthState = () => authService.forceSyncAuthState(); 
export const getAuthState = () => authService.getAuthState();
export const isAuthenticated = () => authService.isAuthenticated();
export const signOut = async () => {
  const authService = AuthService.getInstance();
  const supabase = authService.getSupabaseClient();
  await supabase.auth.signOut();
  await authService.clearAuthState();
};