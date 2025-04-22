// 添加全局类型声明
declare global {
  interface Window {
    __SUPABASE_INITIALIZED?: boolean;
  }
}

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// 全局 Supabase 单例
let supabaseInstance: SupabaseClient<Database> | null = null;

// 确保环境变量存在
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('缺少 Supabase 环境变量')
}

// 获取当前站点的基础 URL，用于 OAuth 回调
function getSiteUrl() {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  // 默认使用环境变量中定义的 URL 或本地开发 URL
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

// 安全地访问 localStorage，带有错误处理
function safeLocalStorage(operation: 'get' | 'set' | 'remove', key: string, value?: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    
    if (operation === 'get') {
      return localStorage.getItem(key);
    } else if (operation === 'set' && value !== undefined) {
      localStorage.setItem(key, value);
      return value;
    } else if (operation === 'remove') {
      localStorage.removeItem(key);
    }
    return null;
  } catch (error) {
    console.warn(`[SupabaseClient] localStorage 操作 ${operation} 失败:`, error);
    return null;
  }
}

// 安全地访问 cookie，带有错误处理
function safeCookie(operation: 'get' | 'set' | 'remove', key: string, value?: string): string | null {
  try {
    if (typeof document === 'undefined') return null;
    
    if (operation === 'get') {
      const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
      return match ? match[2] : null;
    } else if (operation === 'set' && value !== undefined) {
      document.cookie = `${key}=${value}; path=/; max-age=86400; SameSite=Lax`;
      return value;
    } else if (operation === 'remove') {
      document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
    return null;
  } catch (error) {
    console.warn(`[SupabaseClient] cookie 操作 ${operation} 失败:`, error);
    return null;
  }
}

// 自定义存储适配器
const customStorageAdapter = {
  getItem: (key: string) => {
    return safeLocalStorage('get', key) || safeCookie('get', key);
  },
  setItem: (key: string, value: string) => {
    safeLocalStorage('set', key, value);
    safeCookie('set', key, value);
  },
  removeItem: (key: string) => {
    safeLocalStorage('remove', key);
    safeCookie('remove', key);
  }
};

/**
 * 创建并获取 Supabase 客户端实例
 * 使用单例模式确保整个应用只有一个实例
 */
export function getSupabase(): SupabaseClient<Database> {
  if (supabaseInstance) {
    return supabaseInstance
  }

  console.log('[SupabaseClient] 创建新的 Supabase 客户端实例');
  
  // 获取 OAuth 回调 URL
  const redirectUrl = `${getSiteUrl()}/auth/callback`;
  console.log('[SupabaseClient] OAuth 回调 URL:', redirectUrl);
  
  // 创建 Supabase 选项并手动添加 redirectTo
  const authOptions: any = {
    persistSession: true,
    storageKey: 'sb-auth-token',
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: customStorageAdapter
  };
  
  // 手动添加重定向 URL (绕过 TypeScript 类型检查)
  authOptions.redirectTo = redirectUrl;
  
  // 创建新的客户端实例
  supabaseInstance = createClient<Database>(
    supabaseUrl, 
    supabaseAnonKey, 
    {
      auth: authOptions,
      global: {
        headers: {
          'x-client-info': 'supabase-js-v2'
        }
      }
    }
  );

  // 添加日志监控会话状态变化
  if (typeof window !== 'undefined' && supabaseInstance) {
    supabaseInstance.auth.onAuthStateChange((event, session) => {
      console.log('[SupabaseClient] 会话状态变化:', event);
      
      if (event === 'SIGNED_IN' && session) {
        // 设置持久化标记
        safeLocalStorage('set', 'user_authenticated', 'true');
        safeCookie('set', 'user_authenticated', 'true');
      } else if (event === 'SIGNED_OUT') {
        // 清除持久化标记
        safeLocalStorage('remove', 'user_authenticated');
        safeCookie('remove', 'user_authenticated');
      }
    });
  }

  if (!supabaseInstance) {
    throw new Error('Supabase 客户端创建失败');
  }

  return supabaseInstance;
}

// 导出单例实例
export const supabase = getSupabase() 