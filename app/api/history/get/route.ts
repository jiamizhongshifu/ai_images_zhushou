import { NextRequest } from 'next/server';
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

// 内存缓存系统 - 注意：这只在单实例服务器上有效，分布式系统需要使用Redis等
const serverCache = new Map<string, ServerCacheItem>();
// 请求去重系统
const requestTracker = new Map<string, RequestTracker>();

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
    
    console.log(`[服务端缓存清理] 当前缓存条目: ${serverCache.size}, 请求追踪条目: ${requestTracker.size}`);
  }, CLEANUP_INTERVAL);
}

// 初始化缓存清理
setupCacheCleanup();

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
  const requestId = request.headers.get('X-Request-ID') || Math.random().toString(36).substring(2, 15);
  const isXHR = request.headers.get('X-Requested-With') === 'XMLHttpRequest';
  const ifNoneMatch = request.headers.get('If-None-Match') || '';
  
  // 创建请求追踪键 - 相同参数的请求使用相同的键
  const requestKey = `history:${limit}:${offset}:${requestId}`;
  console.log(`[历史API] 处理请求: ${requestKey}`);
  
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
    
    // 请求去重逻辑 - 如果相同请求正在处理中，则等待其完成
    const existingRequest = requestTracker.get(cacheKey);
    if (existingRequest && existingRequest.inProgress) {
      console.log(`[历史API] 检测到重复请求: ${cacheKey}，复用处理中的请求`);
      // 等待已存在的请求处理完成
      if (existingRequest.promiseResolver) {
        const cachedResponse = await existingRequest.promiseResolver;
        return cachedResponse;
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