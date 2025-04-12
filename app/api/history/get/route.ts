import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// 历史记录最大数量限制
const MAX_HISTORY_RECORDS = 100;
// 缓存控制参数
const CACHE_MAX_AGE = 300; // 5分钟缓存

// 服务器端内存缓存
interface ServerCacheItem {
  data: any;
  timestamp: number;
  expiresAt: number;
  etag: string;
}

// 服务器端请求去重
interface RequestTracker {
  timestamp: number;
  inProgress: boolean;
  promiseResolver?: Promise<any>;
}

// 客户端请求频率跟踪
interface ClientRequestStats {
  lastRequestTime: number;
  requestCount: number;
  firstRequestTime: number;
}

// 内存缓存系统 - 注意：这只在单实例服务器上有效，分布式系统需要使用Redis等
const serverCache = new Map<string, ServerCacheItem>();
// 请求去重系统
const requestTracker = new Map<string, RequestTracker>();
// 客户端请求频率跟踪
const clientRequestStats = new Map<string, ClientRequestStats>();

// 自动清理过期的缓存和请求追踪器
function setupCacheCleanup() {
  // 每5分钟清理一次缓存和请求追踪
  const CLEANUP_INTERVAL = 5 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    
    // 清理过期缓存
    serverCache.forEach((item, key) => {
      if (now > item.expiresAt) {
        serverCache.delete(key);
      }
    });
    
    // 清理过期请求追踪器
    requestTracker.forEach((tracker, key) => {
      // 删除超过1分钟的追踪记录
      if (now - tracker.timestamp > 60000) {
        requestTracker.delete(key);
      }
    });
    
    // 清理客户端请求统计
    clientRequestStats.forEach((stats, clientId) => {
      // 清理超过10分钟的客户端记录
      if (now - stats.firstRequestTime > 10 * 60 * 1000) {
        clientRequestStats.delete(clientId);
      }
    });
    
    console.log(`[服务端缓存清理] 当前缓存条目: ${serverCache.size}, 请求追踪条目: ${requestTracker.size}, 客户端记录: ${clientRequestStats.size}`);
  }, CLEANUP_INTERVAL);
}

// 初始化缓存清理
setupCacheCleanup();

// 检查客户端请求频率
function checkClientRequestRate(clientId: string): { allowed: boolean, retryAfter?: number } {
  const now = Date.now();
  const MAX_REQUESTS_PER_MINUTE = 20; // 每分钟最大请求数
  const MIN_REQUEST_INTERVAL = 500; // 最小请求间隔(毫秒)
  
  // 获取或创建客户端记录
  let stats = clientRequestStats.get(clientId);
  if (!stats) {
    stats = {
      lastRequestTime: now,
      requestCount: 1,
      firstRequestTime: now
    };
    clientRequestStats.set(clientId, stats);
    return { allowed: true };
  }
  
  // 计算时间间隔
  const timeSinceLastRequest = now - stats.lastRequestTime;
  
  // 检查请求间隔是否太短
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    console.log(`[历史API] 客户端${clientId}请求过于频繁，间隔仅${timeSinceLastRequest}ms`);
    return { 
      allowed: false,
      retryAfter: Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastRequest) / 1000)
    };
  }
  
  // 检查一分钟内的请求数量
  const oneMinuteAgo = now - 60 * 1000;
  if (stats.firstRequestTime >= oneMinuteAgo && stats.requestCount >= MAX_REQUESTS_PER_MINUTE) {
    console.log(`[历史API] 客户端${clientId}请求过多，一分钟内已有${stats.requestCount}次请求`);
    return { 
      allowed: false,
      retryAfter: Math.ceil((stats.firstRequestTime + 60 * 1000 - now) / 1000) 
    };
  }
  
  // 更新统计
  stats.lastRequestTime = now;
  stats.requestCount++;
  // 超过一分钟则重置计数
  if (stats.firstRequestTime < oneMinuteAgo) {
    stats.firstRequestTime = now;
    stats.requestCount = 1;
  }
  
  return { allowed: true };
}

// 请求缓存和去重控制
const recentRequests = new Map<string, {
  timestamp: number,
  result: any,
  count: number
}>();

// 最小请求间隔时间 - 同一用户相同参数的请求最小间隔(毫秒)
const MIN_REQUEST_INTERVAL = 1000;
// 清理间隔 - 定期清理过期请求记录(毫秒)
const CLEANUP_INTERVAL = 60 * 1000; // 1分钟
// 缓存生存时间 - 请求结果缓存有效期(毫秒)
const CACHE_TTL = 30 * 1000; // 30秒
// 短期内相同请求计数阈值 - 触发节流
const REQUEST_COUNT_THRESHOLD = 5;
// 短期计数窗口时间(毫秒)
const COUNT_WINDOW = 10 * 1000; // 10秒

// 定期清理过期的请求记录
const cleanupRecentRequests = () => {
  const now = Date.now();
  recentRequests.forEach((data, key) => {
    if (now - data.timestamp > CACHE_TTL) {
      recentRequests.delete(key);
    }
  });
};

// 在服务器端启动清理任务
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRecentRequests, CLEANUP_INTERVAL);
}

/**
 * 获取用户图片生成历史记录
 * 
 * GET 参数:
 * - limit: 可选，限制返回记录数量，默认20条
 * - offset: 可选，分页偏移量，默认0
 * 
 * 返回:
 * {
 *   success: boolean,
 *   history: Array<{
 *     id: number,
 *     image_url: string,
 *     prompt: string,
 *     created_at: string,
 *     model_used: string,
 *     generation_settings: Object,
 *     status: string
 *   }>,
 *   error?: string
 * }
 */
export async function GET(request: NextRequest) {
  // 提取请求参数，用于生成缓存键和请求ID
  const { searchParams } = new URL(request.url);
  const requestedLimit = parseInt(searchParams.get('limit') || '20');
  const limit = Math.min(requestedLimit, MAX_HISTORY_RECORDS);
  const offset = parseInt(searchParams.get('offset') || '0');
  
  // 检查请求头
  const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const requestId = request.headers.get('X-Request-ID') || Math.random().toString(36).substring(2, 15);
  const isXHR = request.headers.get('X-Requested-With') === 'XMLHttpRequest';
  const ifNoneMatch = request.headers.get('If-None-Match') || '';
  
  // 创建客户端ID - 用于请求频率限制
  const clientId = `${clientIP}:${userAgent.substring(0, 50)}`;
  
  // 检查客户端请求频率
  const rateCheck = checkClientRequestRate(clientId);
  if (!rateCheck.allowed) {
    console.log(`[历史API] 客户端请求频率超限: ${clientId}`);
    return new Response(JSON.stringify({ 
      success: false, 
      error: '请求过于频繁，请稍后再试',
      retry_after: rateCheck.retryAfter
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': `${rateCheck.retryAfter || 1}`,
        'X-RateLimit-Reset': `${Date.now() + (rateCheck.retryAfter || 1) * 1000}`
      }
    });
  }
  
  // 创建请求追踪键 - 相同参数的请求使用相同的键
  const requestKey = `history:${limit}:${offset}:${requestId}`;
  console.log(`[历史API] 处理请求: ${requestKey}, 客户端: ${clientId}`);
  
  try {
    // 获取当前用户
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '用户未认证' 
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    // 生成唯一缓存键
    const cacheKey = `history:${user.id}:${limit}:${offset}`;
    
    // 检查缓存和去重
    if (recentRequests.has(cacheKey)) {
      const cachedRequest = recentRequests.get(cacheKey)!;
      
      // 如果是短时间内的重复请求，返回缓存结果
      if (Date.now() - cachedRequest.timestamp < MIN_REQUEST_INTERVAL) {
        console.log(`用户 ${user.id} 请求过于频繁，使用缓存结果`);
        
        // 更新请求计数
        cachedRequest.count++;
        
        // 检查是否应该应用节流控制
        if (cachedRequest.count > REQUEST_COUNT_THRESHOLD && 
            Date.now() - cachedRequest.timestamp < COUNT_WINDOW) {
          
          // 返回429状态码，要求客户端限制请求频率
          return NextResponse.json({ 
            success: false, 
            message: '请求过于频繁，请稍后再试',
            retry_after: 3 // 建议客户端3秒后重试
          }, { 
            status: 429,
            headers: {
              'Retry-After': '3'
            }
          });
        }
        
        // 返回缓存的结果但更新时间戳
        cachedRequest.timestamp = Date.now();
        return NextResponse.json(cachedRequest.result);
      }
      
      // 如果缓存未过期，返回缓存结果
      if (Date.now() - cachedRequest.timestamp < CACHE_TTL) {
        console.log(`用户 ${user.id} 使用缓存结果`);
        return NextResponse.json(cachedRequest.result);
      }
    }
    
    // 检查ETag
    const cachedItem = serverCache.get(cacheKey);
    if (cachedItem && ifNoneMatch === cachedItem.etag) {
      console.log(`[历史API] ETag匹配，返回304: ${cacheKey}`);
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
          'ETag': cachedItem.etag,
        }
      });
    }
    
    // 检查缓存是否有效
    if (cachedItem && Date.now() < cachedItem.expiresAt) {
      console.log(`[历史API] 缓存命中: ${cacheKey}`);
      return new Response(JSON.stringify(cachedItem.data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
          'ETag': cachedItem.etag,
          'X-Cache': 'HIT'
        }
      });
    }
    
    // 标记请求正在处理
    const currentRequest: RequestTracker = {
      timestamp: Date.now(),
      inProgress: true
    };
    
    // 创建Promise处理器，允许其他请求等待此请求
    let promiseResolve!: (value: Response) => void;
    const promiseResolver = new Promise<Response>((resolve) => {
      promiseResolve = resolve;
    });
    
    currentRequest.promiseResolver = promiseResolver;
    
    // 将请求加入跟踪列表
    requestTracker.set(cacheKey, currentRequest);
    
    // 查询数据库
    console.log(`[历史API] 缓存未命中，查询数据库: ${cacheKey}`);
    const { data, error } = await supabase
      .from('ai_images_creator_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('查询历史记录失败:', error);
      const errorResponse = new Response(JSON.stringify({ 
        success: false, 
        error: '查询历史记录失败' 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // 释放请求锁定
      requestTracker.delete(cacheKey);
      
      // 解决Promise
      promiseResolve(errorResponse);
      
      return errorResponse;
    }
    
    // 处理URL格式，确保所有URL都是完整正确的格式
    const processedData = data.map(item => {
      // 确保URL格式正确
      if (item.image_url && typeof item.image_url === 'string') {
        let imageUrl = item.image_url.trim();
        
        // 移除URL两端的引号
        if ((imageUrl.startsWith('"') && imageUrl.endsWith('"')) || 
            (imageUrl.startsWith("'") && imageUrl.endsWith("'"))) {
          imageUrl = imageUrl.slice(1, -1);
        }
        
        // 确保URL包含协议
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          imageUrl = `https://${imageUrl}`;
        }
        
        // 确保filesystem.site域名正确
        if (imageUrl.includes('filesystem.site')) {
          // 移除URL末尾可能的多余字符
          imageUrl = imageUrl.replace(/[.,;:!?)]$/, '');
        }
        
        item.image_url = imageUrl;
      }
      return item;
    });
    
    // 生成响应数据
    const responseData = { 
      success: true, 
      history: processedData,
      meta: {
        limit,
        offset,
        total_records: processedData.length,
        has_more: processedData.length >= limit,
        max_limit: MAX_HISTORY_RECORDS
      }
    };
    
    // 生成ETag
    const etag = `"history-${user.id}-${offset}-${limit}-${Date.now()}"`;
    
    // 更新服务器缓存
    serverCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now(),
      expiresAt: Date.now() + (CACHE_MAX_AGE * 1000),
      etag
    });
    
    // 缓存请求结果
    recentRequests.set(cacheKey, {
      timestamp: Date.now(),
      result: responseData,
      count: 1
    });
    
    // 返回结果
    console.log(`[历史API] 成功获取${processedData.length}条历史记录，已缓存`);
    if (processedData.length > 0) {
      console.log('[历史API] 首条记录示例:', {
        id: processedData[0].id,
        image_url: processedData[0].image_url,
        prompt: processedData[0].prompt?.substring(0, 30) + '...'
      });
    }
    
    // 构建响应
    const response = new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
        'ETag': etag,
        'X-Cache': 'MISS'
      }
    });
    
    // 释放请求锁定
    if (requestTracker.has(cacheKey)) {
      requestTracker.get(cacheKey)!.inProgress = false;
    }
    
    // 解决Promise
    promiseResolve(response);
    
    return response;
  } catch (error) {
    console.error('[历史API] 获取历史记录出错:', error);
    
    // 清理请求追踪
    const cacheKey = `history:${requestId}`;
    if (requestTracker.has(cacheKey)) {
      requestTracker.delete(cacheKey);
    }
    
    // 构建错误响应
    return new Response(JSON.stringify({ 
      success: false, 
      error: '服务器内部错误' 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
} 