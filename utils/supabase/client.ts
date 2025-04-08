import { createBrowserClient } from "@supabase/ssr";

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
    return createBrowserClient(supabaseUrl, supabaseAnonKey, {
      // 浏览器客户端不需要cookie方法
      cookies: {
        get: (name) => {
          // 从document.cookie获取
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop()?.split(';').shift();
          return null;
        },
        set: (name, value, options) => {
          // 设置到document.cookie
          let cookie = `${name}=${value}`;
          if (options?.maxAge) cookie += `; Max-Age=${options.maxAge}`;
          if (options?.path) cookie += `; Path=${options.path}`;
          document.cookie = cookie;
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
  } catch (error) {
    console.error("创建Supabase客户端失败:", error);
    // 失败时使用基本配置重试一次
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
};
