/**
 * 请求限制器 - 用于限制API请求频率，合并短时间内的相同请求
 */

// 请求类型枚举 - 使用字符串枚举确保toString可用
export enum REQUEST_KEYS {
  CREDITS = 'credits',
  USER_INFO = 'user_info',
  AUTH_STATUS = 'auth_status',
  IMAGES = 'images',
  HISTORY = 'history'
}

// 请求键类型
export type RequestKey = REQUEST_KEYS | string;

// 活跃请求映射表
interface ActiveRequestMap {
  [key: string]: {
    promise: Promise<any>;
    timestamp: number;
    forceRefresh?: boolean;
  };
}

// 冷却时间记录
interface CooldownMap {
  [key: string]: number;
}

// 活跃请求缓存
const activeRequests: ActiveRequestMap = {};
// 请求冷却时间记录
const requestCooldowns: CooldownMap = {};

/**
 * 获取请求的字符串键
 * @param key 请求键
 * @returns 字符串形式的键
 */
function getRequestKey(key: RequestKey): string {
  return typeof key === 'string' ? key : key;
}

/**
 * 限制请求频率，合并重复请求
 * @param key 请求标识符
 * @param requestFn 实际发起请求的函数
 * @param cooldownMs 冷却时间（毫秒）
 * @param forceRefresh 是否强制刷新（忽略冷却时间）
 * @returns 请求结果
 */
export async function limitRequest<T>(
  key: RequestKey,
  requestFn: () => Promise<T>,
  cooldownMs: number = 5000,
  forceRefresh: boolean = false
): Promise<T> {
  const now = Date.now();
  const requestKey = getRequestKey(key);
  
  // 检查是否在冷却时间内
  if (!forceRefresh && requestCooldowns[requestKey] && now - requestCooldowns[requestKey] < cooldownMs) {
    console.log(`[RequestLimiter] 请求 "${requestKey}" 在冷却时间内，跳过`);
    throw new Error(`请求 "${requestKey}" 在冷却时间内，请稍后再试`);
  }
  
  // 检查是否有进行中的相同请求
  const activeRequest = activeRequests[requestKey];
  if (activeRequest && (!forceRefresh || activeRequest.forceRefresh === forceRefresh)) {
    // 如果存在活跃请求且不强制刷新，或强制刷新状态相同，则复用请求
    console.log(`[RequestLimiter] 复用进行中的 "${requestKey}" 请求`);
    return activeRequest.promise;
  }
  
  // 创建新请求
  console.log(`[RequestLimiter] 创建新的 "${requestKey}" 请求${forceRefresh ? '（强制刷新）' : ''}`);
  
  // 包装请求，确保完成后清理缓存
  const requestPromise = (async () => {
    try {
      const result = await requestFn();
      
      // 设置冷却时间
      requestCooldowns[requestKey] = Date.now();
      
      // 请求完成后删除活跃请求记录
      delete activeRequests[requestKey];
      
      return result;
    } catch (error) {
      // 请求失败也要删除活跃请求记录
      delete activeRequests[requestKey];
      throw error;
    }
  })();
  
  // 记录活跃请求
  activeRequests[requestKey] = {
    promise: requestPromise,
    timestamp: now,
    forceRefresh
  };
  
  return requestPromise;
}

/**
 * 检查请求是否在冷却中
 * @param key 请求标识符
 * @param cooldownMs 可选的自定义冷却时间
 * @returns 是否在冷却中
 */
export function isRequestInCooldown(
  key: RequestKey,
  cooldownMs: number = 5000
): boolean {
  const now = Date.now();
  const requestKey = getRequestKey(key);
  
  return !!(
    requestCooldowns[requestKey] && 
    now - requestCooldowns[requestKey] < cooldownMs
  );
}

/**
 * 重置请求冷却时间
 * @param key 请求标识符，不提供则重置所有
 */
export function resetRequestCooldown(key?: RequestKey): void {
  if (key) {
    const requestKey = getRequestKey(key);
    delete requestCooldowns[requestKey];
    console.log(`[RequestLimiter] 重置 "${requestKey}" 请求的冷却时间`);
  } else {
    // 重置所有冷却时间
    Object.keys(requestCooldowns).forEach(k => delete requestCooldowns[k]);
    console.log('[RequestLimiter] 重置所有请求的冷却时间');
  }
}

/**
 * 取消进行中的请求
 * @param key 请求标识符，不提供则取消所有
 */
export function cancelActiveRequest(key?: RequestKey): void {
  if (key) {
    const requestKey = getRequestKey(key);
    delete activeRequests[requestKey];
    console.log(`[RequestLimiter] 取消 "${requestKey}" 活跃请求`);
  } else {
    // 取消所有活跃请求
    Object.keys(activeRequests).forEach(k => delete activeRequests[k]);
    console.log('[RequestLimiter] 取消所有活跃请求');
  }
} 