import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from './auth-middleware';

/**
 * 简单的内存缓存，用于存储请求计数
 * 注意：在多实例环境中，应使用Redis等分布式缓存替代
 */
class RateLimitStore {
  private store: Map<string, { count: number, resetTime: number }>;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.store = new Map();
    // 定期清理过期记录
    this.startCleanup();
  }
  
  /**
   * 增加指定键的计数并检查是否超出限制
   * @param key 唯一标识符（如IP地址或用户ID）
   * @param limit 限制次数
   * @param windowMs 时间窗口（毫秒）
   * @returns 是否达到速率限制
   */
  increment(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const record = this.store.get(key);
    
    // 如果不存在记录或已过期，创建新记录
    if (!record || now > record.resetTime) {
      this.store.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return false; // 未达到限制
    }
    
    // 增加计数
    record.count += 1;
    
    // 检查是否超出限制
    return record.count > limit;
  }
  
  /**
   * 获取指定键的剩余请求次数和重置时间
   * @param key 唯一标识符
   * @param limit 限制次数
   * @returns 剩余次数和重置时间
   */
  getRemainingInfo(key: string, limit: number): { remaining: number, resetTime: number } {
    const now = Date.now();
    const record = this.store.get(key);
    
    if (!record || now > record.resetTime) {
      return { 
        remaining: limit, 
        resetTime: now // 没有记录时重置时间为当前时间
      };
    }
    
    return {
      remaining: Math.max(0, limit - record.count),
      resetTime: record.resetTime
    };
  }
  
  /**
   * 启动定期清理过期记录的任务
   */
  private startCleanup() {
    // 每10分钟清理一次过期记录
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.store.entries()) {
        if (now > record.resetTime) {
          this.store.delete(key);
        }
      }
    }, 10 * 60 * 1000);
    
    // 防止内存泄漏
    if (typeof window === 'undefined' && this.cleanupInterval && this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }
  
  /**
   * 停止清理任务
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// 创建全局速率限制存储
export const globalRateLimitStore = new RateLimitStore();

/**
 * 速率限制配置选项
 */
export interface RateLimitOptions {
  /** 时间窗口内允许的最大请求数 */
  limit: number;
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 用于生成键的函数，默认使用IP地址 */
  keyGenerator?: (req: NextRequest) => string;
  /** 是否在响应头中包含速率限制信息 */
  headers?: boolean;
  /** 当达到限制时返回的状态码 */
  statusCode?: number;
  /** 当达到限制时返回的消息 */
  message?: string;
  /** 是否跳过速率限制检查的条件函数 */
  skip?: (req: NextRequest) => boolean | Promise<boolean>;
}

/**
 * 创建速率限制中间件
 * @param options 速率限制选项
 * @returns 中间件函数
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    limit = 60,
    windowMs = 60 * 1000, // 默认1分钟
    keyGenerator = (req) => getClientIP(req),
    headers = true,
    statusCode = 429,
    message = '请求过于频繁，请稍后再试',
    skip
  } = options;
  
  return async function rateLimitMiddleware(req: NextRequest) {
    // 检查是否跳过速率限制
    if (skip && await skip(req)) {
      return null; // 跳过限制，继续处理请求
    }
    
    // 生成键
    const key = keyGenerator(req);
    
    // 检查是否达到限制
    const limited = globalRateLimitStore.increment(key, limit, windowMs);
    
    // 获取剩余信息，用于响应头
    const { remaining, resetTime } = globalRateLimitStore.getRemainingInfo(key, limit);
    
    // 构建响应
    if (limited) {
      // 达到限制，返回429状态码
      const response = NextResponse.json({
        success: false,
        error: message,
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
      }, { status: statusCode });
      
      // 添加响应头
      if (headers) {
        response.headers.set('X-RateLimit-Limit', limit.toString());
        response.headers.set('X-RateLimit-Remaining', '0');
        response.headers.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
        response.headers.set('Retry-After', Math.ceil((resetTime - Date.now()) / 1000).toString());
      }
      
      return response;
    }
    
    // 未达到限制，返回null继续处理请求
    // 响应头将在withRateLimit中处理
    return null;
  };
}

/**
 * 使用速率限制包装API处理函数
 * @param handler API处理函数
 * @param options 速率限制选项
 * @returns 包装后的处理函数
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse> | NextResponse,
  options: RateLimitOptions
) {
  const rateLimiter = rateLimit(options);
  
  return async function rateLimitedHandler(req: NextRequest): Promise<NextResponse> {
    // 应用速率限制
    const rateLimitResult = await rateLimiter(req);
    
    // 如果达到限制，直接返回限制响应
    if (rateLimitResult) {
      return rateLimitResult;
    }
    
    // 未达到限制，执行原始处理函数
    const response = await handler(req);
    
    // 如果需要，在响应头中添加速率限制信息
    if (options.headers !== false) {
      const key = options.keyGenerator ? options.keyGenerator(req) : getClientIP(req);
      const { remaining, resetTime } = globalRateLimitStore.getRemainingInfo(key, options.limit);
      
      response.headers.set('X-RateLimit-Limit', options.limit.toString());
      response.headers.set('X-RateLimit-Remaining', remaining.toString());
      response.headers.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
    }
    
    return response;
  };
}

/**
 * 为用户ID创建速率限制键生成器
 * @param getUserId 从请求中获取用户ID的函数
 * @returns 键生成器函数
 */
export function userIdKeyGenerator(getUserId: (req: NextRequest) => string | undefined) {
  return (req: NextRequest) => {
    const userId = getUserId(req);
    return userId ? `user:${userId}` : `ip:${getClientIP(req)}`;
  };
}

/**
 * 为IP和路径创建速率限制键生成器
 * @returns 键生成器函数
 */
export function ipPathKeyGenerator(req: NextRequest) {
  const ip = getClientIP(req);
  const path = new URL(req.url).pathname;
  return `${ip}:${path}`;
}

/**
 * 常用的速率限制配置
 */
export const rateLimitPresets = {
  // 通用API限制 - 每分钟60次
  standard: {
    limit: 60,
    windowMs: 60 * 1000
  },
  // 敏感API限制 - 每分钟10次
  sensitive: {
    limit: 10,
    windowMs: 60 * 1000
  },
  // 认证API限制 - 每分钟5次
  auth: {
    limit: 5,
    windowMs: 60 * 1000
  },
  // 支付API限制 - 每分钟3次
  payment: {
    limit: 3,
    windowMs: 60 * 1000
  }
};

/**
 * 为特定命名空间的IP创建速率限制键生成器
 * @param namespace 命名空间前缀
 * @returns 键生成器函数
 */
export function ipKeyGenerator(namespace: string = 'default') {
  return (req: NextRequest) => {
    const ip = getClientIP(req);
    return `${namespace}:${ip}`;
  };
} 