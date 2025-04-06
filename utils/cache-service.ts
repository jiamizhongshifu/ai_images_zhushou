/**
 * 简单的前端缓存服务
 * 用于缓存API响应和其他数据，减少重复请求
 */

// 缓存项类型
export interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// 缓存配置类型
export interface CacheOptions {
  expiresIn?: number; // 过期时间（毫秒）
  refreshThreshold?: number; // 自动刷新阈值（毫秒）
  forceRefresh?: boolean; // 强制刷新
}

// 默认缓存选项
const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  expiresIn: 5 * 60 * 1000, // 默认5分钟
  refreshThreshold: 4 * 60 * 1000, // 默认4分钟（接近过期时）
};

// 缓存状态
export type CacheStatus = 'fresh' | 'stale' | 'expired' | 'none';

class CacheService {
  private cache: Map<string, CacheItem<any>> = new Map();
  private refreshCallbacks: Map<string, (() => void)[]> = new Map();
  
  /**
   * 从缓存获取数据，如果不存在或已过期则使用提供的函数获取新数据
   * @param key 缓存键
   * @param fetcher 获取数据的函数
   * @param options 缓存选项
   * @returns 缓存的数据或新获取的数据
   */
  async getOrFetch<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    options?: CacheOptions
  ): Promise<T> {
    const opts = { ...DEFAULT_CACHE_OPTIONS, ...options };
    const now = Date.now();
    const cachedItem = this.cache.get(key);
    
    // 如果请求强制刷新，则直接获取新数据
    if (opts.forceRefresh) {
      console.log(`[CacheService] 强制刷新: ${key}`);
      return this.fetchAndCache(key, fetcher, opts.expiresIn);
    }
    
    // 如果缓存存在且未过期，直接返回
    if (cachedItem && now < cachedItem.expiresAt) {
      console.log(`[CacheService] 缓存命中: ${key}`);
      
      // 如果接近过期时间，在后台刷新缓存
      if (opts.refreshThreshold && 
          cachedItem.expiresAt - now < opts.refreshThreshold) {
        console.log(`[CacheService] 缓存接近过期，后台刷新: ${key}`);
        this.backgroundRefresh(key, fetcher, opts.expiresIn);
      }
      
      return cachedItem.data;
    }
    
    // 缓存不存在或已过期，获取新数据
    console.log(`[CacheService] 缓存未命中: ${key}，获取新数据`);
    try {
      const data = await fetcher();
      
      // 更新缓存
      this.cache.set(key, {
        data,
        timestamp: now,
        expiresAt: now + (opts.expiresIn || 0)
      });
      
      return data;
    } catch (error) {
      // 如果获取失败但有过期的缓存，仍返回过期的缓存作为降级处理
      if (cachedItem) {
        console.log(`[CacheService] 获取新数据失败，使用过期缓存: ${key}`);
        return cachedItem.data;
      }
      throw error;
    }
  }
  
  /**
   * 在后台刷新缓存，不阻塞当前请求
   */
  private backgroundRefresh<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    expiresIn?: number
  ): void {
    // 使用setTimeout确保异步执行不阻塞主流程
    setTimeout(async () => {
      try {
        await this.fetchAndCache(key, fetcher, expiresIn);
        // 通知监听此缓存项的组件
        this.notifyRefreshListeners(key);
      } catch (error) {
        console.error(`[CacheService] 后台刷新缓存失败: ${key}`, error);
      }
    }, 0);
  }
  
  /**
   * 获取新数据并更新缓存
   */
  private async fetchAndCache<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    expiresIn: number = DEFAULT_CACHE_OPTIONS.expiresIn!
  ): Promise<T> {
    const now = Date.now();
    try {
      const data = await fetcher();
      
      this.cache.set(key, {
        data,
        timestamp: now,
        expiresAt: now + expiresIn
      });
      
      console.log(`[CacheService] 缓存已更新: ${key}`);
      return data;
    } catch (error) {
      console.error(`[CacheService] 获取新数据失败: ${key}`, error);
      throw error;
    }
  }
  
  /**
   * 为缓存项注册刷新监听器
   * @param key 缓存键
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  onRefresh(key: string, callback: () => void): () => void {
    if (!this.refreshCallbacks.has(key)) {
      this.refreshCallbacks.set(key, []);
    }
    
    const callbacks = this.refreshCallbacks.get(key)!;
    callbacks.push(callback);
    
    // 返回取消监听的函数
    return () => {
      const updatedCallbacks = callbacks.filter(cb => cb !== callback);
      this.refreshCallbacks.set(key, updatedCallbacks);
    };
  }
  
  /**
   * 通知缓存项的刷新监听器
   */
  private notifyRefreshListeners(key: string): void {
    const callbacks = this.refreshCallbacks.get(key);
    if (callbacks && callbacks.length > 0) {
      console.log(`[CacheService] 通知缓存刷新监听器: ${key}`);
      callbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error(`[CacheService] 执行刷新回调时出错`, error);
        }
      });
    }
  }
  
  /**
   * 设置缓存内容
   * @param key 缓存键
   * @param data 要缓存的数据
   * @param expiresIn 过期时间（毫秒），默认5分钟
   */
  set<T>(key: string, data: T, expiresIn: number = DEFAULT_CACHE_OPTIONS.expiresIn!): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + expiresIn
    });
    
    // 通知监听此缓存项的组件
    this.notifyRefreshListeners(key);
  }
  
  /**
   * 获取缓存内容
   * @param key 缓存键
   * @returns 缓存的数据，如果不存在或已过期则返回null
   */
  get<T>(key: string): T | null {
    const now = Date.now();
    const cachedItem = this.cache.get(key);
    
    if (cachedItem && now < cachedItem.expiresAt) {
      return cachedItem.data;
    }
    
    return null;
  }
  
  /**
   * 检查缓存状态
   * @param key 缓存键
   * @returns 缓存状态
   */
  checkStatus(key: string): CacheStatus {
    const now = Date.now();
    const cachedItem = this.cache.get(key);
    
    if (!cachedItem) return 'none';
    
    if (now < cachedItem.expiresAt) {
      // 如果距离过期还有超过一半时间，视为新鲜
      if (cachedItem.expiresAt - now > (cachedItem.expiresAt - cachedItem.timestamp) / 2) {
        return 'fresh';
      }
      // 接近过期但仍有效，视为陈旧
      return 'stale';
    }
    
    // 已过期
    return 'expired';
  }
  
  /**
   * 获取特定前缀的所有缓存键
   * @param prefix 缓存键前缀
   * @returns 匹配的缓存键数组
   */
  getKeysByPrefix(prefix: string): string[] {
    const matchingKeys: string[] = [];
    
    this.cache.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        matchingKeys.push(key);
      }
    });
    
    return matchingKeys;
  }
  
  /**
   * 创建带前缀的缓存键
   * @param prefix 缓存键前缀
   * @param key 缓存键
   * @returns 带前缀的缓存键
   */
  createKey(prefix: string, key: string): string {
    return `${prefix}:${key}`;
  }
  
  /**
   * 删除缓存内容
   * @param key 缓存键
   */
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * 清除特定前缀的所有缓存
   * @param prefix 缓存键前缀
   */
  clearByPrefix(prefix: string): void {
    const keysToDelete = this.getKeysByPrefix(prefix);
    
    // 删除收集到的键
    keysToDelete.forEach(key => {
      this.cache.delete(key);
    });
    
    console.log(`[CacheService] 已清除前缀为 "${prefix}" 的 ${keysToDelete.length} 项缓存`);
  }
}

// 创建单例实例
export const cacheService = new CacheService();

// 常用缓存前缀
export const CACHE_PREFIXES = {
  USER_CREDITS: 'user:credits',
  HISTORY: 'history',
  IMAGES: 'images',
  TASKS: 'tasks',
  SETTINGS: 'settings'
}; 