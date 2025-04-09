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

/**
 * 用户点数服务类
 */
class CreditService {
  private static instance: CreditService;

  private constructor() {
    // 初始化时立即同步一次缓存中的点数
    this.syncFromCache();
    
    // 订阅认证状态变化
    authService.subscribe((authState) => {
      if (authState.isAuthenticated) {
        // 用户登录时获取点数
        this.fetchCredits();
      } else {
        // 用户登出时清空点数
        this.setCreditState({
          credits: null,
          lastUpdate: Date.now(),
          isLoading: false
        });
      }
    });
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
      return null;
    }
    
    // 如果已经有刷新请求在进行中，复用那个Promise
    if (isRefreshing && refreshPromise) {
      console.log('[CreditService] 已有刷新请求在进行中，复用现有Promise');
      return refreshPromise;
    }
    
    isRefreshing = true;
    this.setCreditState({ isLoading: true });
    
    refreshPromise = (async () => {
      try {
        // 使用缓存服务获取数据
        const data = await cacheService.getOrFetch<CreditsResponse>(
          CREDITS_CACHE_KEY,
          async () => {
            console.log('[CreditService] 从API获取点数');
            const response = await fetch('/api/credits/get', {
              headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (!response.ok) {
              if (response.status === 401) {
                // 清空点数状态，触发认证服务检查
                authService.refreshSession();
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
          
          return data.credits;
        } else {
          console.error('[CreditService] 获取点数失败:', data.error);
          return creditState.credits; // 返回当前的点数状态
        }
      } catch (error) {
        console.error('[CreditService] 获取点数出错:', error);
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
    this.setCreditState({
      credits: newCredits,
      lastUpdate: Date.now()
    });
    
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
}

// 创建单例实例
const creditService = CreditService.getInstance();

// 导出方法
export { creditService };
export const getCredits = () => creditService.getCredits();
export const fetchCredits = (forceRefresh?: boolean) => creditService.fetchCredits(forceRefresh);
export const updateCredits = (newCredits: number) => creditService.updateCredits(newCredits);
export const clearCreditsCache = () => creditService.clearCache();
export const resetCreditsState = () => creditService.resetState(); 