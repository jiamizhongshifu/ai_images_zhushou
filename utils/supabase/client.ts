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
  // 从环境变量中读取URL和ANON KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 验证环境变量存在
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("缺少必要的Supabase环境变量");
    throw new Error("缺少必要的Supabase环境变量");
  }

  try {
    // 检查是否在服务器端环境
    const isServer = typeof window === 'undefined';
    
    if (isServer) {
      // 在服务器端环境下使用基本配置创建客户端
      console.log("[SupabaseClient] 在服务器端创建简化客户端");
      return createBrowserClient(supabaseUrl, supabaseAnonKey);
    }
    
    // 在浏览器环境下使用完整配置
    // 使用正确的创建客户端参数格式
    const client = createBrowserClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get: (name) => {
            try {
              // 从document.cookie获取
              if (typeof document === 'undefined') return null;
              
              const value = `; ${document.cookie}`;
              const parts = value.split(`; ${name}=`);
              if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
              return null;
            } catch (error) {
              console.error(`[SupabaseClient] 获取cookie "${name}"出错:`, error);
              return null;
            }
          },
          set: (name, value, options) => {
            try {
              // 设置到document.cookie，添加适当的选项
              if (typeof document === 'undefined') return;
              
              let cookie = `${name}=${value}`;
              if (options?.maxAge) cookie += `; Max-Age=${options.maxAge}`;
              if (options?.path) cookie += `; Path=${options.path || '/'}`;
              
              // 添加SameSite属性，默认为Lax以支持跨站点请求
              cookie += `; SameSite=Lax`;
              
              // 在生产环境添加Secure标记
              if (window.location.protocol === 'https:') {
                cookie += `; Secure`;
              }
              
              document.cookie = cookie;
              
              // 更明确地设置认证相关cookie，确保包含所有必要属性
              if (name === 'sb-access-token' && value) {
                const authCookie = `user_authenticated=true; path=/; max-age=604800; SameSite=Lax`;
                document.cookie = authCookie;
                
                // 确保清除任何登出标记
                document.cookie = 'logged_out=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                document.cookie = 'force_logged_out=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                
                // 记录到localStorage
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem('wasAuthenticated', 'true');
                  localStorage.setItem('auth_time', Date.now().toString());
                  localStorage.setItem('auth_valid', 'true');
                  
                  // 清除登出标记
                  localStorage.removeItem('force_logged_out');
                }
                
                if (typeof sessionStorage !== 'undefined') {
                  sessionStorage.removeItem('isLoggedOut');
                  sessionStorage.setItem('activeAuth', 'true');
                }
                
                console.log(`[SupabaseClient] 已设置认证cookie: ${name}=${value.substring(0, 10)}... 和关联标记`);
              }
              
              // 清除可能的登出标记
              if ((name === 'sb-access-token' || name === 'sb-refresh-token') && value) {
                if (typeof localStorage !== 'undefined') {
                  localStorage.removeItem('force_logged_out');
                }
                if (typeof sessionStorage !== 'undefined') {
                  sessionStorage.removeItem('isLoggedOut');
                }
              }
            } catch (error) {
              console.error(`[SupabaseClient] 设置cookie "${name}"出错:`, error);
            }
          },
          remove: (name, options) => {
            try {
              // 从document.cookie移除
              if (typeof document === 'undefined') return;
              
              document.cookie = `${name}=; Max-Age=0; Path=${options?.path || '/'}`;
              
              // 如果移除认证token，也清除认证标记
              if (name === 'sb-access-token') {
                document.cookie = 'user_authenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
              }
            } catch (error) {
              console.error(`[SupabaseClient] 移除cookie "${name}"出错:`, error);
            }
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
      }
    );
    
    // 订阅会话状态变化
    client.auth.onAuthStateChange(handleSessionChange);
    
    // 在创建时检查是否已有会话，如果有则设置cookie标记
    setTimeout(async () => {
      try {
        const { data: { session } } = await client.auth.getSession();
        if (session && typeof document !== 'undefined') {
          console.log('[SupabaseClient] 初始会话检查发现有效会话，设置cookie标记');
          document.cookie = 'user_authenticated=true; path=/; max-age=604800';
          
          // 记录到localStorage
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('wasAuthenticated', 'true');
            localStorage.setItem('auth_time', Date.now().toString());
          }
        } else {
          console.log('[SupabaseClient] 初始会话检查未发现有效会话');
        }
      } catch (error) {
        console.error('[SupabaseClient] 初始会话检查出错:', error);
      }
    }, 0);
    
    // 设置认证状态定期检查
    if (typeof window !== 'undefined') {
      setupAuthPersistence();
    }
    
    return client;
  } catch (error) {
    console.error("创建Supabase客户端失败:", error);
    // 失败时使用基本配置重试一次
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
};
