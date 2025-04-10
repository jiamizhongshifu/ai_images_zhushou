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

/**
 * 用户点数服务类
 */
class CreditService {
  private static instance: CreditService;
  private pendingAuthCheck: boolean = false;
  private lastAuthCheck: number = 0;

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
            eventBus.emit(CREDIT_EVENTS.CREDITS_CHANGED, this.getCreditState());
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
      const cachedData = cacheService.get<CreditsResponse>(CREDITS_CACHE_KEY);
      if (cachedData && cachedData.success && cachedData.credits !== undefined) {
        this.setCreditState({
          credits: cachedData.credits,
          lastUpdate: Date.now(),
          isLoading: false
        });
        console.log('[CreditService] 从缓存同步点数:', cachedData.credits);
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
   * @param forceRefresh 是否强制刷新缓存
   * @returns 用户点数
   */
  public async fetchCredits(forceRefresh: boolean = false): Promise<number | null> {
    // 检查用户是否已认证
    if (!authService.isAuthenticated()) {
      console.log('[CreditService] 用户未认证，跳过获取点数');
      
      if (creditState.credits !== null) {
        // 确保未认证状态下点数为null
        this.setCreditState({
          credits: null,
          lastUpdate: Date.now()
        });
        // 触发点数变化事件
        eventBus.emit(CREDIT_EVENTS.CREDITS_CHANGED, this.getCreditState());
      }
      
      return null;
    }
    
    // 如果已经有刷新请求在进行中，复用那个Promise
    if (isRefreshing && refreshPromise) {
      console.log('[CreditService] 已有刷新请求在进行中，复用现有Promise');
      return refreshPromise;
    }
    
    console.log('[CreditService] 开始获取点数，强制刷新:', forceRefresh);
    isRefreshing = true;
    this.setCreditState({ isLoading: true });
    
    // 增加随机延迟，避免多个组件同时初始化时的并发请求
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    refreshPromise = (async () => {
      try {
        // 清除缓存，确保从服务器获取最新数据
        if (forceRefresh) {
          cacheService.delete(CREDITS_CACHE_KEY);
          console.log('[CreditService] 强制刷新，已清除点数缓存');
        }

        // 使用缓存服务获取数据
        const data = await cacheService.getOrFetch<CreditsResponse>(
          CREDITS_CACHE_KEY,
          async () => {
            // 添加随机数参数和时间戳，防止缓存
            const timestamp = Date.now();
            const randomParam = Math.random().toString(36).substring(2, 15);
            console.log('[CreditService] 从API获取点数');
            
            // 再次检查认证状态，确保在请求前用户仍然已认证
            if (!authService.isAuthenticated()) {
              console.log('[CreditService] 发起请求前用户已登出，取消获取点数');
              throw new Error('用户未认证');
            }
            
            const response = await fetch(`/api/credits/get?_t=${timestamp}&_r=${randomParam}`, {
              headers: { 
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              },
              // 添加凭据，确保带上认证Cookie
              credentials: 'include'
            });
            
            if (!response.ok) {
              if (response.status === 401) {
                // 清空点数状态，触发认证服务检查
                console.warn('[CreditService] 收到401响应，尝试刷新会话');
                await authService.refreshSession();
                throw new Error('未授权，请重新登录');
              }
              throw new Error(`获取点数失败: HTTP ${response.status}`);
            }
            
            return await response.json();
          },
          {
            expiresIn: CREDITS_CACHE_TTL,
            forceRefresh
          }
        );
        
        if (data.success) {
          console.log('[CreditService] 成功获取用户点数:', data.credits);
          
          this.setCreditState({
            credits: data.credits,
            lastUpdate: Date.now()
          });
          
          // 明确触发点数变化事件
          eventBus.emit(CREDIT_EVENTS.CREDITS_CHANGED, this.getCreditState());
          
          return data.credits;
        } else {
          console.error('[CreditService] 获取点数失败:', data.error);
          // 保持当前点数状态不变
          return creditState.credits; 
        }
      } catch (error) {
        console.error('[CreditService] 获取点数出错:', error);
        
        // 检查是否为认证错误，如果是则清空点数状态
        if (error instanceof Error && 
           (error.message.includes('未授权') || error.message.includes('未认证'))) {
          console.log('[CreditService] 检测到认证错误，清空点数状态');
          this.setCreditState({
            credits: null,
            lastUpdate: Date.now()
          });
          // 触发点数变化事件
          eventBus.emit(CREDIT_EVENTS.CREDITS_CHANGED, this.getCreditState());
        }
        
        return creditState.credits; // 返回当前的点数状态
      } finally {
        this.setCreditState({ isLoading: false });
        
        // 短暂延迟后重置刷新状态，避免并发请求
        setTimeout(() => {
          isRefreshing = false;
          refreshPromise = null;
        }, 500);
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
}

// 创建单例实例
const creditService = CreditService.getInstance();

// 导出事件和方法
export { creditService, CREDIT_EVENTS };
export const getCredits = () => creditService.getCredits();
export const fetchCredits = (forceRefresh?: boolean) => creditService.fetchCredits(forceRefresh);
export const updateCredits = (newCredits: number) => creditService.updateCredits(newCredits);
export const clearCreditsCache = () => creditService.clearCache();
export const resetCreditsState = () => creditService.resetState();
export const onCreditEvent = (event: string, callback: Function) => creditService.onEvent(event, callback);
export const triggerCreditRefresh = () => creditService.triggerRefresh(); 