/**
 * 用户点数服务 - 提供全局状态管理的点数服务
 */

import { authService } from '@/utils/auth-service';
import { cacheService, CACHE_PREFIXES } from '@/utils/cache-service';

// 点数响应类型
interface CreditsResponse {
  success: boolean;
  credits: number;
  error?: string;
  timestamp?: number;
}

// 点数状态
interface CreditState {
  credits: number | null;
  lastUpdate: number;
  isLoading: boolean;
}

// 缓存键
const CREDITS_CACHE_KEY = CACHE_PREFIXES.USER_CREDITS + ':global';
// 缓存有效期
const CREDITS_CACHE_TTL = 30 * 1000; // 30秒

// 全局点数状态
let creditState: CreditState = {
  credits: null,
  lastUpdate: 0,
  isLoading: false
};

// 订阅者列表
const subscribers: Array<(state: CreditState) => void> = [];

// 防止并发请求
let isRefreshing = false;
let refreshPromise: Promise<number | null> | null = null;

// 添加全局事件类型
const CREDIT_EVENTS = {
  CREDITS_CHANGED: 'credits_changed',
  CREDITS_REFRESH_NEEDED: 'credits_refresh_needed',
  PAGE_NAVIGATED: 'page_navigated'
};

// 全局事件总线
const eventBus = {
  listeners: {} as Record<string, Function[]>,
  
  on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  },
  
  off(event: string, callback: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  },
  
  emit(event: string, data?: any) {
    if (!this.listeners[event]) return;
    console.log(`[EventBus] 触发事件: ${event}`, data ? '有数据' : '无数据');
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[EventBus] 执行事件回调出错:`, error);
      }
    });
  }
};

// 添加路由监听，当路由变化时触发刷新
if (typeof window !== 'undefined') {
  try {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    
    // 重写pushState以捕获导航
    window.history.pushState = function() {
      const result = originalPushState.apply(this, arguments as any);
      console.log('[CreditService] 检测到页面导航 (pushState)');
      eventBus.emit(CREDIT_EVENTS.PAGE_NAVIGATED);
      return result;
    };
    
    // 重写replaceState以捕获导航
    window.history.replaceState = function() {
      const result = originalReplaceState.apply(this, arguments as any);
      console.log('[CreditService] 检测到页面导航 (replaceState)');
      eventBus.emit(CREDIT_EVENTS.PAGE_NAVIGATED);
      return result;
    };
    
    // 监听popstate事件（后退/前进按钮）
    window.addEventListener('popstate', () => {
      console.log('[CreditService] 检测到页面导航 (popstate)');
      eventBus.emit(CREDIT_EVENTS.PAGE_NAVIGATED);
    });
    
    console.log('[CreditService] 已设置页面导航监听');
  } catch (error) {
    console.error('[CreditService] 设置页面导航监听失败:', error);
  }
}

// 用户点数服务类
class CreditService {
  private static instance: CreditService;
  private pendingAuthCheck: boolean = false;
  private lastAuthCheck: number = 0;
  // 添加内存缓存
  private _memoryCache: { credits: number | null; timestamp: number } = {
    credits: null,
    timestamp: 0
  };

  private constructor() {
    // 初始化时立即同步一次缓存中的点数
    this.syncFromCache();
    
    // 订阅认证状态变化
    authService.subscribe((authState) => {
      // 加入防抖动，避免短时间内多次触发
      const now = Date.now();
      if (this.pendingAuthCheck || (now - this.lastAuthCheck < 1000)) {
        console.log('[CreditService] 跳过短时间内重复的认证状态检查');
        return;
      }
      
      this.pendingAuthCheck = true;
      this.lastAuthCheck = now;
      
      setTimeout(() => {
        this.pendingAuthCheck = false;
        
        if (authState.isAuthenticated) {
          // 用户登录时获取点数
          console.log('[CreditService] 用户已登录，获取最新点数');
          this.fetchCredits(true).then(credits => {
            // 发送点数刷新完成事件
            eventBus.emit(CREDIT_EVENTS.CREDITS_CHANGED, credits);
            console.log('[CreditService] 已发送点数变化事件:', credits);
          }).catch(err => {
            console.error('[CreditService] 获取点数失败:', err);
          });
        } else {
          // 用户登出时清空点数
          this.setCreditState({
            credits: null,
            lastUpdate: Date.now(),
            isLoading: false
          });
          // 发送点数变化事件
          eventBus.emit(CREDIT_EVENTS.CREDITS_CHANGED, this.getCreditState());
        }
      }, 100);
    });
    
    // 添加页面加载完成事件监听
    if (typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        console.log('[CreditService] 页面加载完成，检查认证状态');
        if (authService.isAuthenticated()) {
          console.log('[CreditService] 页面加载完成，用户已登录，获取点数');
          this.fetchCredits(true);
        }
      });
    }
  }

  /**
   * 获取服务实例
   */
  public static getInstance(): CreditService {
    if (!CreditService.instance) {
      CreditService.instance = new CreditService();
    }
    return CreditService.instance;
  }

  /**
   * 从缓存同步点数状态
   */
  private syncFromCache(): void {
    try {
      // 首先尝试从API缓存获取
      const cachedData = cacheService.get<CreditsResponse>(CREDITS_CACHE_KEY);
      if (cachedData && cachedData.success && cachedData.credits !== undefined) {
        this.setCreditState({
          credits: cachedData.credits,
          lastUpdate: Date.now(),
          isLoading: false
        });
        console.log('[CreditService] 从缓存同步点数:', cachedData.credits);
        
        // 同时更新内存缓存
        this._memoryCache = {
          credits: cachedData.credits,
          timestamp: Date.now()
        };
        
        return;
      }
      
      // 如果API缓存失败，尝试从本地存储获取
      try {
        const localData = localStorage.getItem('user_credits');
        if (localData) {
          const parsedData = JSON.parse(localData);
          if (parsedData && parsedData.credits !== undefined) {
            this.setCreditState({
              credits: parsedData.credits,
              lastUpdate: Date.now(),
              isLoading: false
            });
            console.log('[CreditService] 从本地存储同步点数:', parsedData.credits);
            
            // 同时更新内存缓存
            this._memoryCache = {
              credits: parsedData.credits,
              timestamp: Date.now()
            };
          }
        }
      } catch (e) {
        console.warn('[CreditService] 从本地存储同步点数失败:', e);
      }
    } catch (error) {
      console.error('[CreditService] 从缓存同步点数失败:', error);
    }
  }

  /**
   * 获取点数状态
   */
  public getCreditState(): CreditState {
    return { ...creditState };
  }

  /**
   * 获取用户点数
   */
  public getCredits(): number | null {
    return creditState.credits;
  }

  /**
   * 设置点数状态并通知订阅者
   */
  private setCreditState(newState: Partial<CreditState>): void {
    creditState = {
      ...creditState,
      ...newState
    };
    
    // 通知所有订阅者
    this.notifySubscribers();
  }

  /**
   * 通知所有订阅者状态更新
   */
  private notifySubscribers(): void {
    subscribers.forEach(callback => {
      try {
        callback(this.getCreditState());
      } catch (error) {
        console.error('[CreditService] 执行订阅回调出错:', error);
      }
    });
  }

  /**
   * 订阅点数状态变化
   * @param callback 回调函数
   * @returns 取消订阅的函数
   */
  public subscribe(callback: (state: CreditState) => void): () => void {
    subscribers.push(callback);
    
    // 立即调用一次回调，提供当前状态
    try {
      callback(this.getCreditState());
    } catch (error) {
      console.error('[CreditService] 执行初始回调出错:', error);
    }
    
    // 返回取消订阅的函数
    return () => {
      const index = subscribers.indexOf(callback);
      if (index > -1) {
        subscribers.splice(index, 1);
      }
    };
  }

  /**
   * 获取最新点数
   * @param forceRefresh 是否强制刷新
   * @returns 点数值，失败时返回null
   */
  public async fetchCredits(forceRefresh: boolean = false): Promise<number | null> {
    // 检查用户是否已登录
    if (!authService.isAuthenticated()) {
      console.log('[CreditService] 用户未登录，跳过获取点数');
      return null;
    }
    
    // 开始加载状态
    this.setCreditState({
      isLoading: true
    });
    
    // 从缓存获取数据，作为快速响应
    const cachedCredits = this.getCachedCredits();
    if (cachedCredits !== null && !forceRefresh) {
      // 如果有缓存且不强制刷新，立即使用缓存值
      console.log('[CreditService] 使用缓存的点数:', cachedCredits);
      this.setCreditState({
        credits: cachedCredits,
        lastUpdate: Date.now(),
        isLoading: false
      });
      return cachedCredits;
    }
    
    // 检查是否已经有请求在进行中
    if (isRefreshing && !forceRefresh) {
      console.log('[CreditService] 正在进行中的点数请求，等待结果');
      return refreshPromise;
    }
    
    // 标记正在刷新
    isRefreshing = true;
    
    // 使用Promise包装以便重用
    refreshPromise = (async () => {
      const startTime = Date.now();
      console.log('[CreditService] 开始获取用户点数， 强制刷新:', forceRefresh);
      
      let lastKnownCredits = cachedCredits; // 保存最后已知的点数用于错误恢复
      
      try {
        // 检查缓存，除非强制刷新
        if (!forceRefresh) {
          const cachedData = cacheService.get<CreditsResponse>(CREDITS_CACHE_KEY);
          
          // 如果缓存有效且不强制刷新，直接使用缓存
          if (cachedData && cachedData.success && cachedData.credits !== undefined &&
              (Date.now() - (cachedData.timestamp || 0) < CREDITS_CACHE_TTL)) {
            console.log('[CreditService] 使用缓存点数:', cachedData.credits);
            
            // 更新状态
            this.setCreditState({
              credits: cachedData.credits,
              lastUpdate: Date.now(),
              isLoading: false
            });
            
            // 更新内存缓存
            this._memoryCache = {
              credits: cachedData.credits,
              timestamp: Date.now()
            };
            
            return cachedData.credits;
          }
        } else {
          console.log('[CreditService] 强制刷新，跳过缓存检查');
        }
        
        // 调用API获取点数
        console.log('[CreditService] 调用API获取用户点数');
        const response = await fetch('/api/credits/get' + (forceRefresh ? '?force=1' : ''), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          cache: 'no-store'
        });
        
        // 处理响应
        if (response.ok) {
          const data: CreditsResponse = await response.json();
          
          if (data.success && data.credits !== undefined) {
            console.log('[CreditService] 获取点数成功:', data.credits);
            
            // 缓存结果
            cacheService.set(CREDITS_CACHE_KEY, {
              ...data,
              timestamp: Date.now()
            }, CREDITS_CACHE_TTL);
            
            // 更新状态
            this.setCreditState({
              credits: data.credits,
              lastUpdate: Date.now(),
              isLoading: false
            });
            
            // 更新内存缓存
            this._memoryCache = {
              credits: data.credits,
              timestamp: Date.now()
            };
            
            // 尝试安全地更新localStorage，即使在受限环境也不会抛出错误
            try {
              localStorage.setItem('user_credits', JSON.stringify({
                credits: data.credits,
                timestamp: Date.now()
              }));
            } catch (e) {
              console.warn('[CreditService] 无法写入本地存储:', e);
            }
            
            // 计算API调用耗时
            const duration = Date.now() - startTime;
            console.log(`[CreditService] 获取点数API调用成功，耗时: ${duration}ms, 点数:`, data.credits);
            
            // 发送点数变化事件
            eventBus.emit(CREDIT_EVENTS.CREDITS_CHANGED, data.credits);
            
            return data.credits;
          } else {
            console.error('[CreditService] API返回数据格式错误:', data);
            throw new Error(data.error || '获取点数失败');
          }
        } else {
          // 尝试读取错误信息
          let errorMsg = '获取点数失败';
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch (e) {
            // 忽略JSON解析错误
          }
          
          console.error(`[CreditService] API请求失败 (${response.status}): ${errorMsg}`);
          throw new Error(errorMsg);
        }
      } catch (error) {
        console.error('[CreditService] 获取点数错误:', error);
        
        // 更新状态，停止加载，但保持当前点数不变
        this.setCreditState({
          isLoading: false
        });
        
        // 返回最后已知点数作为降级策略
        if (lastKnownCredits !== null) {
          console.log('[CreditService] 降级策略：返回最后已知点数:', lastKnownCredits);
          // 发送错误事件
          eventBus.emit('credits_error', { 
            error: error instanceof Error ? error.message : String(error),
            lastKnownCredits
          });
          return lastKnownCredits;
        }
        
        // 完全失败的情况
        return null;
      } finally {
        // 重置刷新状态
        isRefreshing = false;
        refreshPromise = null;
      }
    })();
    
    return refreshPromise;
  }
  
  /**
   * 更新点数（例如在购买或使用后直接更新）
   * @param newCredits 新的点数值
   */
  public updateCredits(newCredits: number): void {
    console.log('[CreditService] 更新点数:', newCredits);
    
    this.setCreditState({
      credits: newCredits,
      lastUpdate: Date.now()
    });
    
    // 发送点数变化事件
    eventBus.emit(CREDIT_EVENTS.CREDITS_CHANGED, this.getCreditState());
    console.log('[CreditService] 已发送点数变化事件');
    
    // 更新缓存
    try {
      const cachedData = cacheService.get<CreditsResponse>(CREDITS_CACHE_KEY);
      if (cachedData) {
        cacheService.set(
          CREDITS_CACHE_KEY,
          {
            ...cachedData,
            credits: newCredits
          },
          CREDITS_CACHE_TTL
        );
      }
    } catch (error) {
      console.error('[CreditService] 更新点数缓存失败:', error);
    }
  }
  
  /**
   * 清除点数缓存
   */
  public clearCache(): void {
    cacheService.delete(CREDITS_CACHE_KEY);
    console.log('[CreditService] 已清除点数缓存');
  }
  
  /**
   * 完全重置点数状态（用于登出）
   */
  public resetState(): void {
    // 清除缓存
    this.clearCache();
    
    // 重置状态
    this.setCreditState({
      credits: null,
      lastUpdate: Date.now(),
      isLoading: false
    });
    
    console.log('[CreditService] 已完全重置点数状态');
  }

  /**
   * 订阅点数相关事件
   * @param event 事件名称
   * @param callback 回调函数
   */
  public onEvent(event: string, callback: Function): () => void {
    return eventBus.on(event, callback);
  }

  /**
   * 触发需要刷新点数的事件
   */
  public triggerRefresh(): void {
    console.log('[CreditService] 触发点数刷新事件');
    eventBus.emit(CREDIT_EVENTS.CREDITS_REFRESH_NEEDED);
  }

  /**
   * 获取缓存的点数
   * 优先使用内存缓存，避免存储访问错误
   */
  public getCachedCredits(): number | null {
    // 优先使用内存缓存，避免存储访问错误
    if (this._memoryCache.credits !== null && 
        Date.now() - this._memoryCache.timestamp < 30 * 60 * 1000) {
      return this._memoryCache.credits;
    }
    
    // 尝试从localStorage获取，但忽略错误
    try {
      const cachedData = localStorage.getItem('user_credits');
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        if (parsedData && parsedData.credits !== undefined) {
          const { credits, timestamp } = parsedData;
          if (Date.now() - timestamp < 30 * 60 * 1000) {
            return credits;
          }
        }
      }
    } catch (e) {
      console.warn('[CreditService] 无法访问本地存储:', e);
    }
    
    return null;
  }
}

// CreditService单例实例
const creditService = CreditService.getInstance();

// 导出函数接口，这些函数都使用单例
export const getCredits = () => creditService.getCredits();
export const fetchCredits = (forceRefresh?: boolean) => creditService.fetchCredits(forceRefresh);
export const updateCredits = (newCredits: number) => creditService.updateCredits(newCredits);
export const clearCreditsCache = () => creditService.clearCache();
export const resetCreditsState = () => creditService.resetState();
export const onCreditEvent = (event: string, callback: Function) => creditService.onEvent(event, callback);
export const triggerCreditRefresh = () => creditService.triggerRefresh();

// 导出单例，方便直接使用
export { creditService }; 