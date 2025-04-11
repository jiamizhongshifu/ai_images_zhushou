import { NextRequest, NextResponse } from 'next/server';

// 请求记录类型
interface RequestRecord {
  timestamp: number;
  count: number;
  lastResponseTime: number; // 上次响应时间
}

// 内存中的请求记录（按IP+任务ID组合键存储）
const requestRecords = new Map<string, RequestRecord>();

// 清理过期记录（5分钟未访问的记录）
setInterval(() => {
  const now = Date.now();
  // 修复Map迭代方式，适配所有TS目标
  const keys = Array.from(requestRecords.keys());
  for (const key of keys) {
    const record = requestRecords.get(key);
    if (record && now - record.timestamp > 5 * 60 * 1000) {
      requestRecords.delete(key);
    }
  }
}, 60 * 1000); // 每分钟清理一次

/**
 * 请求节流中间件，限制相同IP和任务ID的高频请求
 * @param request 请求对象
 * @param options 配置项
 * @returns Response或null（继续处理）
 */
export async function throttleImageTaskRequests(
  request: NextRequest,
  options: {
    windowMs?: number; // 时间窗口（毫秒），默认60秒
    maxRequests?: number; // 时间窗口内最大请求数，默认20次
    minInterval?: number; // 两次请求的最小间隔（毫秒），默认500毫秒
  } = {}
): Promise<NextResponse | null> {
  // 从URL获取任务ID
  const taskId = request.nextUrl.pathname.split('/').pop();
  if (!taskId) return null; // 没有任务ID，继续处理

  // 获取IP地址 - 修复NextRequest.ip的兼容性问题
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
  
  // 创建唯一键（IP+任务ID）
  const key = `${clientIp}:${taskId}`;
  
  // 获取当前时间
  const now = Date.now();
  
  // 获取或创建请求记录
  const record = requestRecords.get(key) || { timestamp: now, count: 0, lastResponseTime: 0 };
  
  // 设置配置项默认值
  const windowMs = options.windowMs || 60 * 1000; // 默认60秒
  const maxRequests = options.maxRequests || 20; // 默认20次/分钟
  const minInterval = options.minInterval || 500; // 默认500毫秒间隔
  
  // 检查请求间隔
  const timeSinceLastResponse = now - record.lastResponseTime;
  if (timeSinceLastResponse < minInterval) {
    // 更新记录
    record.timestamp = now;
    record.count += 1;
    requestRecords.set(key, record);
    
    // 返回节流响应
    return NextResponse.json(
      {
        success: false,
        error: '请求过于频繁',
        retryAfter: minInterval - timeSinceLastResponse
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((minInterval - timeSinceLastResponse) / 1000)),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': String(Math.max(0, maxRequests - record.count))
        }
      }
    );
  }
  
  // 检查当前时间窗口内的请求数
  if (now - record.timestamp < windowMs && record.count >= maxRequests) {
    // 更新记录
    record.count += 1;
    requestRecords.set(key, record);
    
    // 计算重试时间
    const retryAfter = windowMs - (now - record.timestamp);
    
    // 返回超限响应
    return NextResponse.json(
      {
        success: false,
        error: '请求次数超过限制',
        retryAfter: retryAfter
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(retryAfter / 1000)),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0'
        }
      }
    );
  }
  
  // 如果是新时间窗口，重置计数
  if (now - record.timestamp >= windowMs) {
    record.timestamp = now;
    record.count = 1;
  } else {
    // 否则增加计数
    record.count += 1;
  }
  
  // 更新最后响应时间
  record.lastResponseTime = now;
  
  // 保存记录
  requestRecords.set(key, record);
  
  // 继续处理请求
  return null;
} 