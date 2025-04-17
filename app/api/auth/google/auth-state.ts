// 添加全局类型声明
declare global {
  var __GOOGLE_AUTH_SESSIONS: Map<string, any>;
}

// 存储待处理的认证状态
export const pendingAuths = new Map();

// 确保全局认证会话存储存在
if (typeof global !== 'undefined' && !global.__GOOGLE_AUTH_SESSIONS) {
  global.__GOOGLE_AUTH_SESSIONS = new Map();
  console.log('[GoogleAuth] 初始化全局会话存储');
}

/**
 * 获取认证状态
 */
export function getAuthState(sessionKey: string) {
  return pendingAuths.get(sessionKey);
}

/**
 * 更新认证状态
 */
export function updateAuthState(sessionKey: string, update: any) {
  const current = pendingAuths.get(sessionKey) || {};
  pendingAuths.set(sessionKey, { ...current, ...update });
  return pendingAuths.get(sessionKey);
}

/**
 * 清理超过30分钟的登录状态
 */
export function cleanupOldAuthStates() {
  const now = Date.now();
  pendingAuths.forEach((value, key) => {
    if (now - value.timestamp > 30 * 60 * 1000) {
      pendingAuths.delete(key);
    }
  });
} 