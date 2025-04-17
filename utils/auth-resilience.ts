/**
 * 认证服务弹性增强模块 - 提供离线认证模式和故障恢复能力
 */

import { authService, refreshSession } from './auth-service';

// 认证连接错误相关参数
let lastAuthConnectFailure = 0;
let authConnectionFailureCount = 0;
const MAX_AUTH_FAILURES = 3;
const AUTH_FAILURE_WINDOW = 5 * 60 * 1000; // 5分钟

/**
 * 设置认证连接问题标记
 */
const setAuthConnectionIssue = () => {
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `auth_connection_issue=true;path=/;max-age=${60 * 30}`;
      console.warn('[认证弹性] 已设置认证连接问题标记 (30分钟有效)');
    }
  } catch (error) {
    console.error('[认证弹性] 设置认证连接问题标记时出错:', error);
  }
};

/**
 * 清除认证连接问题标记
 */
const clearAuthConnectionIssue = () => {
  try {
    if (typeof document !== 'undefined') {
      document.cookie = 'auth_connection_issue=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT';
      console.log('[认证弹性] 已清除认证连接问题标记');
    }
  } catch (error) {
    console.error('[认证弹性] 清除认证连接问题标记时出错:', error);
  }
};

/**
 * 检查是否启用了离线模式
 * @returns {boolean} 是否启用离线模式
 */
export const isOfflineModeEnabled = (): boolean => {
  try {
    if (typeof document !== 'undefined') {
      return document.cookie.includes('force_login=true');
    }
    return false;
  } catch (error) {
    console.error('[认证弹性] 检查离线模式状态时出错:', error);
    return false;
  }
};

/**
 * 处理存储访问失败情况
 * 在隐私模式或存储不可用时调用
 */
export const handleStorageAccessFailure = (): void => {
  try {
    console.warn('[认证弹性] 处理存储访问失败，可能在隐私模式下');
    // 设置Cookie标记
    if (typeof document !== 'undefined') {
      document.cookie = 'storage_access_failed=true;path=/;max-age=' + (60 * 30); // 30分钟有效期
    }
  } catch (error) {
    console.error('[认证弹性] 处理存储访问失败时出错:', error);
  }
};

/**
 * 记录认证连接失败
 * @returns 当前失败计数
 */
const recordAuthConnectionFailure = (): number => {
  try {
    const now = Date.now();
    
    // 如果超过失败窗口时间，重置计数
    if (now - lastAuthConnectFailure > AUTH_FAILURE_WINDOW) {
      authConnectionFailureCount = 1;
    } else {
      authConnectionFailureCount++;
    }
    
    lastAuthConnectFailure = now;
    
    console.warn(`[认证弹性] 认证连接失败，当前计数: ${authConnectionFailureCount}/${MAX_AUTH_FAILURES}`);
    
    // 如果失败次数超过阈值，设置认证连接问题标记
    if (authConnectionFailureCount >= MAX_AUTH_FAILURES) {
      setAuthConnectionIssue();
      
      // 设置强制登录cookie以启用离线模式
      if (typeof document !== 'undefined') {
        document.cookie = `force_login=true;path=/;max-age=${60 * 60}`;
        console.log('[认证弹性] 已启用离线认证模式 (1小时有效)');
      }
    }
    
    return authConnectionFailureCount;
  } catch (error) {
    console.error('[认证弹性] 记录认证连接失败时出错:', error);
    return 0;
  }
};

/**
 * 重置认证连接失败计数
 */
const resetAuthConnectionFailures = () => {
  try {
    authConnectionFailureCount = 0;
    lastAuthConnectFailure = 0;
    clearAuthConnectionIssue();
    console.log('[认证弹性] 已重置认证连接失败计数');
  } catch (error) {
    console.error('[认证弹性] 重置认证连接失败计数时出错:', error);
  }
};

/**
 * 检测认证服务连接状态
 * @returns Promise<boolean> 连接是否正常
 */
const checkAuthConnection = async (): Promise<boolean> => {
  try {
    console.log('[认证弹性] 检查认证服务连接状态...');
    await refreshSession();
    console.log('[认证弹性] 认证服务连接正常');
    resetAuthConnectionFailures();
    return true;
  } catch (error) {
    console.error('[认证弹性] 认证服务连接检查出错:', error);
    recordAuthConnectionFailure();
    return false;
  }
};

/**
 * 启用认证服务弹性增强
 * - 定期检查认证服务连接状态
 * - 在连接问题时自动启用离线模式
 * - 在恢复连接时自动恢复正常模式
 */
export const enhanceAuthResilience = () => {
  // 只在客户端环境下执行
  if (typeof window === 'undefined') return;
  
  console.log('[认证弹性] 正在启用认证服务弹性增强...');
  
  // 启动时立即检查一次
  setTimeout(() => {
    checkAuthConnection().catch(console.error);
  }, 2000);
  
  // 每5分钟检查一次
  setInterval(() => {
    checkAuthConnection().catch(console.error);
  }, 5 * 60 * 1000);
  
  console.log('[认证弹性] 认证服务弹性增强已启用');
};

export default enhanceAuthResilience; 