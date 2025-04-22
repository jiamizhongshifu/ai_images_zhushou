import { createBrowserClient } from "@supabase/ssr";
import { AuthChangeEvent, Session } from '@supabase/supabase-js';

// 调试标志 - 设置为true开启详细日志
const DEBUG = true;

// 调试日志函数
function debugLog(...args: any[]) {
  if (DEBUG && typeof console !== 'undefined') {
    console.log('[SupabaseClient]', ...args);
  }
}

// 在会话变化时添加或移除cookie标记
const handleSessionChange = (event: AuthChangeEvent, session: Session | null) => {
  try {
    debugLog(`会话状态变化: ${event}`);
    
    // 当用户登录或刷新token时，设置认证cookie
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      debugLog(`用户已登录或刷新令牌，设置认证cookie`);
      
      // 用cookie记录认证状态，设置较长有效期
      if (typeof document !== 'undefined') {
        document.cookie = 'user_authenticated=true; path=/; max-age=604800; SameSite=Lax'; // 7天
      }
      
      // 确保持久化到localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('wasAuthenticated', 'true');
        // 记录认证时间
        localStorage.setItem('auth_time', Date.now().toString());
        // 添加访问令牌最后4位作为指纹（不包含敏感信息）
        if (session.access_token) {
          const tokenFingerprint = session.access_token.slice(-4);
          localStorage.setItem('token_fingerprint', tokenFingerprint);
        }
      }
      
      // 清除可能的登出标记
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('force_logged_out');
        localStorage.removeItem('logged_out');
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('isLoggedOut');
      }
    } 
    
    // 当用户登出时，清除认证cookie
    if (event === 'SIGNED_OUT') {
      debugLog(`用户已登出，清除认证cookie`);
      
      // 清除认证cookie
      if (typeof document !== 'undefined') {
        document.cookie = 'user_authenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        // 清除可能的supabase cookie
        document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'sb-refresh-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
      
      // 清除localStorage中的认证记录
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('wasAuthenticated');
        localStorage.removeItem('auth_time');
        localStorage.removeItem('token_fingerprint');
        
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
  
  debugLog('设置认证持久化机制');
  
  // 每10分钟检查一次认证状态
  const interval = setInterval(async () => {
    try {
      if (typeof localStorage === 'undefined') return;
      
      const wasAuthenticated = localStorage.getItem('wasAuthenticated');
      
      if (wasAuthenticated === 'true') {
        debugLog('检查并续期认证状态');
        
        // 获取可能的Supabase客户端
        let supabase;
        try {
          // 在全局命名空间中查找supabase客户端
          if (window && (window as any).supabaseClient) {
            supabase = (window as any).supabaseClient;
          }
          
          // 尝试刷新会话
          if (supabase && typeof supabase.auth === 'object') {
            debugLog('尝试刷新会话');
            const { data, error } = await supabase.auth.getSession();
            
            if (error) {
              console.error('[SupabaseClient] 获取会话失败:', error);
            } else if (data && data.session) {
              debugLog('会话有效，续期认证状态');
              
              // 续期cookie (7天)
              if (typeof document !== 'undefined') {
                document.cookie = 'user_authenticated=true; path=/; max-age=604800; SameSite=Lax';
              }
              
              // 更新认证时间
              localStorage.setItem('auth_time', Date.now().toString());
            } else {
              debugLog('会话已失效，清除认证状态');
              handleSessionChange('SIGNED_OUT', null);
            }
          }
        } catch (clientError) {
          console.error('[SupabaseClient] 获取客户端或刷新会话失败:', clientError);
        }
      }
    } catch (error) {
      console.error('[SupabaseClient] 续期认证状态出错:', error);
    }
  }, 10 * 60 * 1000); // 10分钟
  
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
      debugLog("在服务器端创建简化客户端");
      return createBrowserClient(supabaseUrl, supabaseAnonKey);
    }
    
    // 检查是否已有客户端实例
    if (typeof window !== 'undefined' && (window as any).supabaseClient) {
      debugLog("返回现有的客户端实例");
      return (window as any).supabaseClient;
    }
    
    debugLog("在浏览器环境创建新的Supabase客户端实例");
    
    // 在浏览器环境下使用完整配置
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
    
    // 保存到全局变量
    if (typeof window !== 'undefined') {
      (window as any).supabaseClient = client;
    }
    
    // 订阅会话状态变化
    client.auth.onAuthStateChange(handleSessionChange);
    
    // 设置认证持久化机制
    setupAuthPersistence();
    
    // 在创建时检查是否已有会话，如果有则设置cookie标记
    setTimeout(async () => {
      try {
        debugLog('初始会话检查...');
        const { data: { session }, error } = await client.auth.getSession();
        
        if (error) {
          console.error('[SupabaseClient] 初始会话检查错误:', error);
          return;
        }
        
        if (session) {
          debugLog('初始会话检查发现有效会话，设置cookie标记');
          
          if (typeof document !== 'undefined') {
            document.cookie = 'user_authenticated=true; path=/; max-age=604800; SameSite=Lax';
          }
          
          // 记录到localStorage
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('wasAuthenticated', 'true');
            localStorage.setItem('auth_time', Date.now().toString());
            
            // 添加访问令牌最后4位作为指纹（不包含敏感信息）
            if (session.access_token) {
              const tokenFingerprint = session.access_token.slice(-4);
              localStorage.setItem('token_fingerprint', tokenFingerprint);
            }
          }
          
          // 清除可能的登出标记
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('force_logged_out');
            localStorage.removeItem('logged_out');
          }
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('isLoggedOut');
          }
        } else {
          debugLog('初始会话检查未发现有效会话');
        }
      } catch (error) {
        console.error('[SupabaseClient] 初始会话检查出错:', error);
      }
    }, 100);
    
    return client;
    
  } catch (error) {
    console.error('[SupabaseClient] 创建客户端失败:', error);
    
    // 在出错时提供一个基本客户端
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
};
