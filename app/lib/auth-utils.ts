/**
 * 认证工具函数集合
 * 提供安全的身份验证、调试功能和错误处理
 */

import { toast } from "react-hot-toast";
import { AuthError } from "@supabase/supabase-js";

// 存储诊断信息
interface AuthDiagnostics {
  storageAvailable: boolean;
  cookiesAvailable: boolean;
  lastErrors: Array<string>;
  lastErrorTime?: Date;
  diagnosticChecks: Record<string, boolean>;
}

// 全局诊断对象
const authDiagnostics: AuthDiagnostics = {
  storageAvailable: false,
  cookiesAvailable: false,
  lastErrors: [],
  diagnosticChecks: {}
};

/**
 * 检查浏览器存储可用性
 * @returns 存储是否可用
 */
export function checkStorageAvailability(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    // 测试localStorage
    const testKey = "_auth_storage_test_";
    localStorage.setItem(testKey, "测试");
    localStorage.removeItem(testKey);
    
    // 测试cookies
    document.cookie = "auth_cookie_test=1; path=/; max-age=120";
    const cookieAvailable = document.cookie.indexOf("auth_cookie_test") !== -1;
    
    // 更新诊断信息
    authDiagnostics.storageAvailable = true;
    authDiagnostics.cookiesAvailable = cookieAvailable;
    
    return true;
  } catch (error) {
    console.warn("[Auth] 存储检查失败:", error);
    authDiagnostics.storageAvailable = false;
    authDiagnostics.lastErrors.push(error instanceof Error ? error.message : String(error));
    if (authDiagnostics.lastErrors.length > 5) {
      authDiagnostics.lastErrors.shift();
    }
    authDiagnostics.lastErrorTime = new Date();
    return false;
  }
}

/**
 * 安全获取存储项
 * @param key 存储键名
 * @param fallback 默认值
 * @returns 存储值或默认值
 */
export function safeGetStorageItem(key: string, fallback: string = ""): string {
  if (typeof window === 'undefined') return fallback;
  
  try {
    const value = localStorage.getItem(key);
    return value !== null ? value : fallback;
  } catch (e) {
    console.warn(`[Auth] 无法读取存储项 ${key}:`, e);
    return fallback;
  }
}

/**
 * 安全设置存储项
 * @param key 存储键名
 * @param value 存储值
 * @returns 操作是否成功
 */
export function safeSetStorageItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(`[Auth] 无法设置存储项 ${key}:`, e);
    return false;
  }
}

/**
 * 检查并报告认证环境问题
 * @returns 环境是否正常
 */
export function checkAuthEnvironment(): boolean {
  // 已完成检查则直接返回结果
  if (authDiagnostics.diagnosticChecks.environment) {
    return authDiagnostics.storageAvailable && authDiagnostics.cookiesAvailable;
  }
  
  // 检查存储可用性
  const storageOk = checkStorageAvailability();
  
  // 检查第三方Cookie设置
  const isBrowserRestricted = typeof navigator !== 'undefined' && 
    (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome")) || 
    document.cookie.indexOf("auth_cookie_test") === -1;
  
  // 标记已完成检查
  authDiagnostics.diagnosticChecks.environment = true;
  
  // 如果发现问题，显示提示
  if (!storageOk) {
    toast.error("浏览器存储受限，这可能影响登录功能。请关闭隐私浏览模式或调整Cookie设置。");
    return false;
  }
  
  if (isBrowserRestricted) {
    toast("检测到浏览器可能限制第三方Cookie，这可能影响登录功能。", {
      icon: '⚠️',
      duration: 5000
    });
  }
  
  return storageOk;
}

/**
 * 获取认证诊断信息
 * 用于调试目的
 */
export function getAuthDiagnostics(): AuthDiagnostics {
  return {...authDiagnostics};
}

/**
 * 重置认证状态
 * 用于清除可能的错误状态
 */
export function resetAuthState(): void {
  if (typeof window === 'undefined') return;
  
  try {
    // 清除可能导致问题的认证相关存储
    localStorage.removeItem("supabase.auth.token");
    localStorage.removeItem("supabase.auth.refreshToken");
    
    // 清除会话cookie
    document.cookie = "sb-refresh-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    
    console.log("[Auth] 已重置认证状态");
  } catch (e) {
    console.error("[Auth] 重置认证状态失败:", e);
  }
}

/**
 * 增强社交登录按钮点击处理
 * @param callback 登录回调函数
 * @returns 增强的处理函数
 */
export function enhancedAuthHandler<T = void>(
  callback: () => Promise<T>
): () => Promise<void> {
  return async () => {
    // 检查环境
    checkAuthEnvironment();
    
    try {
      // 调用原始登录函数
      await callback();
    } catch (error) {
      console.error("[Auth] 登录处理错误:", error);
      
      // 记录错误
      if (error instanceof AuthError || error instanceof Error) {
        authDiagnostics.lastErrors.push(error.message);
        if (authDiagnostics.lastErrors.length > 5) {
          authDiagnostics.lastErrors.shift();
        }
        authDiagnostics.lastErrorTime = new Date();
      }
      
      // 显示错误
      toast.error(error instanceof AuthError ? error.message : "登录过程中发生错误，请稍后重试");
    }
  };
} 