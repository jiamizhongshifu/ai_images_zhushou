/**
 * 会话验证工具
 * 提供可靠的会话验证机制，包括重试和错误处理
 */

import { Session } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';

// 验证配置
const CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  CACHE_TTL: 5 * 60 * 1000, // 5分钟缓存有效期
  RECOVERY_COOLDOWN: 30 * 1000, // 30秒恢复冷却期
};

// 会话缓存接口
interface SessionCache {
  session: Session | null;
  timestamp: number;
  validUntil: number;
}

// 会话缓存
let sessionCache: SessionCache | null = null;

/**
 * 带重试机制的会话验证
 * @param getSession 获取会话的函数
 * @param maxRetries 最大重试次数
 * @param retryDelay 重试延迟(ms)
 */
export async function validateSessionWithRetry(
  getSession: () => Promise<Session | null>,
  maxRetries = CONFIG.MAX_RETRIES,
  retryDelay = CONFIG.RETRY_DELAY
): Promise<boolean> {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      console.log(`[SessionValidator] 第${retries + 1}次尝试验证会话`);
      const session = await getSession();
      
      if (session) {
        if (retries > 0) {
          console.log('[SessionValidator] 重试成功获取到有效会话');
        }
        return true;
      }
      
      retries++;
      if (retries < maxRetries) {
        console.log(`[SessionValidator] 会话无效，等待${retryDelay}ms后重试`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      console.error(`[SessionValidator] 验证出错，第${retries + 1}次尝试:`, error);
      retries++;
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  console.warn(`[SessionValidator] 验证失败，已重试${maxRetries}次`);
  return false;
}

/**
 * 获取缓存的会话
 * @param getSession 获取会话的函数
 */
export async function getCachedSession(
  getSession: () => Promise<Session | null>
): Promise<Session | null> {
  const now = Date.now();
  
  // 如果缓存有效，直接返回
  if (sessionCache && now < sessionCache.validUntil) {
    console.log('[SessionValidator] 使用缓存的会话信息');
    return sessionCache.session;
  }
  
  try {
    const session = await getSession();
    
    // 更新缓存
    sessionCache = {
      session,
      timestamp: now,
      validUntil: now + CONFIG.CACHE_TTL
    };
    
    return session;
  } catch (error) {
    console.error('[SessionValidator] 获取会话异常:', error);
    return null;
  }
}

/**
 * 强制刷新会话缓存
 */
export function invalidateSessionCache(): void {
  sessionCache = null;
  console.log('[SessionValidator] 已清除会话缓存');
}

/**
 * 检查是否需要恢复会话
 * @param lastAuthState 上一次的认证状态
 */
export function shouldAttemptRecovery(lastAuthState: boolean): boolean {
  if (!lastAuthState) return false;
  
  const now = Date.now();
  const lastRecoveryAttempt = parseInt(localStorage.getItem('last_recovery_attempt') || '0');
  
  return now - lastRecoveryAttempt > CONFIG.RECOVERY_COOLDOWN;
}

/**
 * 记录恢复尝试时间
 */
export function recordRecoveryAttempt(): void {
  localStorage.setItem('last_recovery_attempt', Date.now().toString());
}

/**
 * 保存认证状态用于恢复
 * @param path 当前路径
 */
export function saveAuthStateForRecovery(path: string): void {
  try {
    localStorage.setItem('auth_recovery_path', path);
    localStorage.setItem('auth_needs_recovery', 'true');
    console.log('[SessionValidator] 已保存认证状态用于恢复:', path);
  } catch (error) {
    console.error('[SessionValidator] 保存认证状态时出错:', error);
  }
}

/**
 * 清除认证恢复状态
 */
export function clearAuthRecoveryState(): void {
  localStorage.removeItem('auth_recovery_path');
  localStorage.removeItem('auth_needs_recovery');
  console.log('[SessionValidator] 已清除认证恢复状态');
} 