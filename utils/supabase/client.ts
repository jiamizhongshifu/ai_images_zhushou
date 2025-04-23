import { createBrowserClient } from "@supabase/ssr";
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { CookieOptions } from '@supabase/ssr';

// 在会话变化时添加或移除cookie标记
const handleSessionChange = (event: AuthChangeEvent, session: Session | null) => {
  try {
    console.log(`[SupabaseClient] 会话状态变化: ${event}`);
    
    // 当用户登录或刷新token时，设置认证cookie
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      console.log(`[SupabaseClient] 用户已登录或刷新令牌，设置认证cookie`);
      
      // 用cookie记录认证状态，设置较长有效期
      if (typeof document !== 'undefined') {
        document.cookie = 'user_authenticated=true; path=/; max-age=604800'; // 7天
      }
      
      // 确保持久化到localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('wasAuthenticated', 'true');
        // 记录认证时间
        localStorage.setItem('auth_time', Date.now().toString());
      }
      
      // 同步添加更多相关标记，确保一致性
      // 确保这些标记在会话刷新时也会更新
      if (event === 'SIGNED_IN') {
        // 清除可能的登出标记
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('force_logged_out');
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('isLoggedOut');
        }
      }
    } 
    
    // 当用户登出时，清除认证cookie
    if (event === 'SIGNED_OUT') {
      console.log(`[SupabaseClient] 用户已登出，清除认证cookie`);
      
      // 清除认证cookie
      if (typeof document !== 'undefined') {
        document.cookie = 'user_authenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
      
      // 清除localStorage中的认证记录
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('wasAuthenticated');
        localStorage.removeItem('auth_time');
        
        // 添加登出标记
        localStorage.setItem('force_logged_out', 'true');
      }
      
      // 添加会话级登出标记
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('isLoggedOut', 'true');
      }
    }
  } catch (error) {
    console.error('[SupabaseClient] 处理会话变化出错:', error);
  }
};

// 定期检查并续期认证状态
const setupAuthPersistence = () => {
  if (typeof window === 'undefined') return;
  
  // 防止多次初始化
  if ((window as any).__authPersistenceSetup) return;
  (window as any).__authPersistenceSetup = true;
  
  // 每30分钟检查一次认证状态
  const interval = setInterval(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      
      const authTime = localStorage.getItem('auth_time');
      const wasAuthenticated = localStorage.getItem('wasAuthenticated');
      
      if (wasAuthenticated === 'true' && typeof document !== 'undefined') {
        console.log(`[SupabaseClient] 续期认证状态`);
        // 续期cookie (7天)
        document.cookie = 'user_authenticated=true; path=/; max-age=604800';
        // 更新认证时间
        localStorage.setItem('auth_time', Date.now().toString());
      }
    } catch (error) {
      console.error('[SupabaseClient] 续期认证状态出错:', error);
    }
  }, 30 * 60 * 1000); // 30分钟
  
  // 在页面卸载时清理
  window.addEventListener('beforeunload', () => {
    clearInterval(interval);
  });
};

export const createClient = () => {
  // 检查是否在浏览器环境
  const isBrowser = typeof window !== 'undefined';

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
        get(name: string) {
          if (!isBrowser) return '';
          return document.cookie
            .split('; ')
            .find((row) => row.startsWith(`${name}=`))
            ?.split('=')[1] || '';
        },
        set(name: string, value: string, options: CookieOptions) {
          if (!isBrowser) return;
          let cookieStr = `${name}=${value}; path=${options.path || '/'}`;
          if (options.maxAge) cookieStr += `; max-age=${options.maxAge}`;
          if (options.domain) cookieStr += `; domain=${options.domain}`;
          if (options.secure) cookieStr += '; secure';
          if (typeof options.sameSite === 'string') {
            cookieStr += `; samesite=${options.sameSite.toLowerCase()}`;
              }
          document.cookie = cookieStr;
        },
        remove(name: string, options: CookieOptions) {
          if (!isBrowser) return;
          document.cookie = `${name}=; path=${options.path || '/'}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
          },
        },
        auth: {
        autoRefreshToken: true,
          persistSession: true,
        detectSessionInUrl: true
        },
      }
    );
};
