import { createBrowserClient } from "@supabase/ssr";
import { AuthChangeEvent, Session } from '@supabase/supabase-js';

// 在会话变化时添加或移除cookie标记
const handleSessionChange = (event: AuthChangeEvent, session: Session | null) => {
  try {
    console.log(`[SupabaseClient] 会话状态变化: ${event}`);
    
    // 当用户登录或刷新token时，设置认证cookie
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      console.log(`[SupabaseClient] 用户已登录或刷新令牌，设置认证cookie`);
      
      // 用cookie记录认证状态，设置较长有效期
      document.cookie = 'user_authenticated=true; path=/; max-age=604800'; // 7天
      
      // 确保持久化到localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('wasAuthenticated', 'true');
      }
    } 
    
    // 当用户登出时，清除认证cookie
    if (event === 'SIGNED_OUT') {
      console.log(`[SupabaseClient] 用户已登出，清除认证cookie`);
      document.cookie = 'user_authenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('wasAuthenticated');
      }
    }
  } catch (error) {
    console.error('[SupabaseClient] 处理会话变化出错:', error);
  }
};

export const createClient = () => {
  // 从环境变量中读取URL和ANON KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 验证环境变量存在
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("缺少必要的Supabase环境变量");
    throw new Error("缺少必要的Supabase环境变量");
  }

  try {
    // 使用正确的创建客户端参数格式
    const client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      // 浏览器客户端必要的cookie方法
      cookies: {
        get: (name) => {
          // 从document.cookie获取
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop()?.split(';').shift();
          return null;
        },
        set: (name, value, options) => {
          // 设置到document.cookie，添加适当的选项
          let cookie = `${name}=${value}`;
          if (options?.maxAge) cookie += `; Max-Age=${options.maxAge}`;
          if (options?.path) cookie += `; Path=${options.path}`;
          document.cookie = cookie;
          
          // 同步设置认证标记cookie
          if (name === 'sb-access-token' && value) {
            document.cookie = 'user_authenticated=true; path=/; max-age=604800';
          }
        },
        remove: (name, options) => {
          // 从document.cookie移除
          document.cookie = `${name}=; Max-Age=0; Path=${options?.path || '/'}`;
        },
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        // 公共存储键名
        storageKey: 'supabase.auth.token',
      },
    });
    
    // 订阅会话状态变化
    client.auth.onAuthStateChange(handleSessionChange);
    
    // 在创建时检查是否已有会话，如果有则设置cookie标记
    setTimeout(async () => {
      try {
        const { data: { session } } = await client.auth.getSession();
        if (session) {
          document.cookie = 'user_authenticated=true; path=/; max-age=604800';
        }
      } catch (error) {
        console.error('[SupabaseClient] 初始会话检查出错:', error);
      }
    }, 0);
    
    return client;
  } catch (error) {
    console.error("创建Supabase客户端失败:", error);
    // 失败时使用基本配置重试一次
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
};
