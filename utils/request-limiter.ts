/**
 * 请求限制器 - 用于控制API请求频率，避免短时间内重复调用
 */

interface RequestRecord {
  timestamp: number;
  inProgress: boolean;
  promise?: Promise<any> | null;
}

// 存储各类请求的记录
const requestRecords: Record<string, RequestRecord> = {};

// 默认配置
const DEFAULT_COOLDOWN = 15000; // 15秒冷却时间

/**
 * 限制特定类型请求的频率，并允许复用进行中的请求
 * @param key 请求的唯一标识
 * @param requestFn 实际执行请求的函数
 * @param cooldown 冷却时间(毫秒)
 * @param forceRefresh 是否强制刷新，忽略冷却时间
 */
export async function limitRequest<T>(
  key: string,
  requestFn: () => Promise<T>,
  cooldown: number = DEFAULT_COOLDOWN,
  forceRefresh: boolean = false
): Promise<T> {
  const now = Date.now();
  const record = requestRecords[key];
  
  // 如果有进行中的请求，直接复用
  if (record?.inProgress && record.promise) {
    console.log(`[RequestLimiter] 复用进行中的 "${key}" 请求`);
    return record.promise;
  }
  
  // 如果非强制刷新且在冷却时间内有记录，跳过请求
  if (!forceRefresh && record && (now - record.timestamp < cooldown)) {
    console.log(`[RequestLimiter] "${key}" 请求在冷却时间内，跳过`);
    throw new Error(`请求 "${key}" 在冷却时间内，请稍后再试`);
  }
  
  // 创建新的请求记录
  const newRequest: RequestRecord = {
    timestamp: now,
    inProgress: true,
    promise: null
  };
  
  try {
    // 执行实际请求并存储Promise
    const promise = requestFn();
    newRequest.promise = promise;
    requestRecords[key] = newRequest;
    
    // 等待请求完成
    const result = await promise;
    
    // 更新记录状态
    requestRecords[key] = {
      timestamp: Date.now(), // 使用最新时间戳
      inProgress: false,
      promise: null
    };
    
    return result;
  } catch (error) {
    // 请求失败，标记为非进行中
    if (requestRecords[key]) {
      requestRecords[key].inProgress = false;
      requestRecords[key].promise = null;
    }
    throw error;
  }
}

/**
 * 清除特定请求的记录
 */
export function clearRequestRecord(key: string): void {
  delete requestRecords[key];
}

/**
 * 获取请求记录的当前状态
 */
export function getRequestStatus(key: string): RequestRecord | null {
  return requestRecords[key] || null;
}

/**
 * 检查请求是否在冷却时间内
 */
export function isRequestInCooldown(key: string, cooldown: number = DEFAULT_COOLDOWN): boolean {
  const record = requestRecords[key];
  if (!record) return false;
  
  return Date.now() - record.timestamp < cooldown;
}

// 导出常用请求类型的键值
export const REQUEST_KEYS = {
  CREDITS: 'user_credits',
  USER_INFO: 'user_info',
  AUTH_STATUS: 'auth_status'
}; 