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
        localStorage.setItem('user_authenticated', 'true');
        document.cookie = `user_authenticated=true; path=/; max-age=86400; SameSite=Lax`;
      } else if (event === 'SIGNED_OUT') {
        // 清除持久化标记
        localStorage.removeItem('user_authenticated');
        document.cookie = `user_authenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
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