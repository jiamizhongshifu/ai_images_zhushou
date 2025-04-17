import { createBrowserClient } from '@supabase/ssr';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/app/lib/mock-storage';

// 单例模式
let supabaseInstance: any = null;

// 添加调试模式
const DEBUG = process.env.NODE_ENV !== 'production';

// 内存中的cookie存储，用于在无法访问document.cookie时降级使用
const memoryCookies: Record<string, string> = {};

/**
 * 安全地检查cookie是否可用
 */
function isCookieAvailable(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  
  try {
    // 尝试访问document.cookie
    const testCookie = document.cookie;
    return true;
  } catch (error) {
    console.warn('[SafeClient] Cookie访问测试失败:', error);
    return false;
  }
}

/**
 * 创建安全的cookie处理函数
 */
const createSafeCookies = () => {
  // 检查cookie可用性并记录
  const cookiesAvailable = isCookieAvailable();
  if (!cookiesAvailable) {
    console.warn('[SafeClient] 浏览器cookie不可用，将使用内存cookie存储');
  } else if (DEBUG) {
    console.log('[SafeClient] 浏览器cookie可用');
  }
  
  return {
    get: (name: string): string | undefined => {
      try {
        if (typeof document === 'undefined' || !cookiesAvailable) {
          if (DEBUG) console.log(`[SafeClient] 使用内存cookie获取: ${name}`);
          return memoryCookies[name];
        }
        
        if (DEBUG) console.log(`[SafeClient] 获取Cookie: ${name}`);
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i].trim();
          if (cookie.substring(0, name.length + 1) === (name + '=')) {
            return decodeURIComponent(cookie.substring(name.length + 1));
          }
        }
        return undefined;
      } catch (error) {
        console.error('[SafeClient] Cookie获取失败:', error);
        // 降级使用内存cookie
        if (DEBUG) console.log(`[SafeClient] 降级使用内存cookie获取: ${name}`);
        return memoryCookies[name];
      }
    },
    set: (name: string, value: string, options: any = {}): void => {
      try {
        // 总是在内存中备份一份，无论cookie是否可用
        memoryCookies[name] = value;
        
        if (typeof document === 'undefined' || !cookiesAvailable) {
          if (DEBUG) console.log(`[SafeClient] 仅使用内存cookie设置: ${name}`);
          return;
        }
        
        if (DEBUG) console.log(`[SafeClient] 设置Cookie: ${name}`);
        let cookieString = `${name}=${encodeURIComponent(value)}`;
        
        if (options.expires) {
          if (typeof options.expires === 'number') {
            const date = new Date();
            date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
            cookieString += `; expires=${date.toUTCString()}`;
          } else if (options.expires instanceof Date) {
            cookieString += `; expires=${options.expires.toUTCString()}`;
          }
        }
        
        if (options.path) cookieString += `; path=${options.path}`;
        if (options.domain) cookieString += `; domain=${options.domain}`;
        if (options.secure) cookieString += '; secure';
        if (options.sameSite) cookieString += `; samesite=${options.sameSite}`;
        
        document.cookie = cookieString;
      } catch (error) {
        console.error('[SafeClient] Cookie设置失败:', error);
      }
    },
    remove: (name: string, options: any = {}): void => {
      try {
        // 总是从内存中删除，无论cookie是否可用
        delete memoryCookies[name];
        
        if (typeof document === 'undefined' || !cookiesAvailable) {
          if (DEBUG) console.log(`[SafeClient] 仅从内存中删除cookie: ${name}`);
          return;
        }
        
        if (DEBUG) console.log(`[SafeClient] 删除Cookie: ${name}`);
        const cookieOptions = {
          ...options,
          expires: new Date(0) // 设置为过去的时间
        };
        
        const cookieValue = '';
        let cookieString = `${name}=${cookieValue}`;
        
        if (cookieOptions.expires) {
          cookieString += `; expires=${cookieOptions.expires.toUTCString()}`;
        }
        
        if (cookieOptions.path) cookieString += `; path=${cookieOptions.path}`;
        if (cookieOptions.domain) cookieString += `; domain=${cookieOptions.domain}`;
        if (cookieOptions.secure) cookieString += '; secure';
        if (cookieOptions.sameSite) cookieString += `; samesite=${cookieOptions.sameSite}`;
        
        document.cookie = cookieString;
      } catch (error) {
        console.error('[SafeClient] Cookie删除失败:', error);
      }
    }
  };
};

/**
 * 创建一个安全的Supabase客户端，不会因为存储访问问题而崩溃
 */
export function createSafeClient() {
  // 确保环境变量存在
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('[SafeClient] 缺少Supabase环境变量');
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: new Error('缺少环境变量') }),
        signOut: () => Promise.resolve({ error: null }),
        signInWithPassword: () => Promise.resolve({ data: { session: null }, error: new Error('缺少环境变量') }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
      }
    };
  }

  if (typeof window === 'undefined') {
    // 服务端运行时返回基本客户端
    if (DEBUG) console.log('[SafeClient] 服务端环境，创建基本客户端');
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get: (name: string) => undefined,
          set: (name: string, value: string) => {},
          remove: (name: string) => {}
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    );
  }

  // 客户端环境下，使用单例模式
  if (supabaseInstance) {
    if (DEBUG) console.log('[SafeClient] 返回已有的Supabase客户端实例');
    return supabaseInstance;
  }

  try {
    console.log('[SafeClient] 开始创建安全的Supabase客户端');
    
    // 创建安全的cookie处理
    const safeCookies = createSafeCookies();
    
    // 创建客户端，使用自定义存储
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get: (name: string) => {
            try {
              return safeCookies.get(name);
            } catch (error) {
              console.warn(`[SafeClient] 获取Cookie ${name}出错:`, error);
              return undefined;
            }
          },
          set: (name: string, value: string, options: any) => {
            try {
              safeCookies.set(name, value, options);
            } catch (error) {
              console.warn(`[SafeClient] 设置Cookie ${name}出错:`, error);
            }
          },
          remove: (name: string, options: any) => {
            try {
              safeCookies.remove(name, options);
            } catch (error) {
              console.warn(`[SafeClient] 删除Cookie ${name}出错:`, error);
            }
          }
        },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce', // 更安全的授权码流程
          storageKey: 'sb-auth-token',
          storage: {
            getItem: (key: string) => {
              try {
                if (DEBUG) console.log(`[SafeClient] 获取存储项: ${key}`);
                return safeGetItem(key);
              } catch (error) {
                console.warn(`[SafeClient] 获取${key}出错:`, error);
                return null;
              }
            },
            setItem: (key: string, value: string) => {
              try {
                if (DEBUG) console.log(`[SafeClient] 设置存储项: ${key}`);
                safeSetItem(key, value);
              } catch (error) {
                console.warn(`[SafeClient] 设置${key}出错:`, error);
              }
            },
            removeItem: (key: string) => {
              try {
                if (DEBUG) console.log(`[SafeClient] 删除存储项: ${key}`);
                safeRemoveItem(key);
              } catch (error) {
                console.warn(`[SafeClient] 删除${key}出错:`, error);
              }
            }
          }
        },
        global: {
          headers: { 'x-application-name': 'ai-images-creator' },
          fetch: (...args: Parameters<typeof fetch>) => {
            return fetch(...args).catch(error => {
              console.error('[SafeClient] 网络请求失败:', error);
              throw error;
            });
          }
        }
      }
    );

    // 增强方法，添加错误处理
    enhanceClientMethods(supabase);

    // 保存单例
    supabaseInstance = supabase;

    console.log('[SafeClient] 已创建安全的Supabase客户端');
    return supabase;
  } catch (error) {
    console.error('[SafeClient] 创建客户端失败:', error);
    // 返回一个基本的模拟客户端，避免崩溃
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error }),
        signOut: () => Promise.resolve({ error: null }),
        signInWithPassword: () => Promise.resolve({ data: { session: null }, error }),
        onAuthStateChange: (callback: any) => {
          console.warn('[SafeClient] 使用降级的模拟客户端');
          return { data: { subscription: { unsubscribe: () => {} } } };
        }
      }
    };
  }
}

/**
 * 增强客户端方法，添加错误处理
 */
function enhanceClientMethods(client: any) {
  if (!client || !client.auth) return;

  try {
    if (DEBUG) console.log('[SafeClient] 开始增强客户端方法');
    
    // 包装getSession方法
    const originalGetSession = client.auth.getSession;
    client.auth.getSession = async function(...args: any[]) {
      try {
        return await originalGetSession.apply(this, args);
      } catch (error) {
        console.error('[SafeClient] getSession出错:', error);
        return { data: { session: null }, error };
      }
    };

    // 包装signOut方法
    const originalSignOut = client.auth.signOut;
    client.auth.signOut = async function(...args: any[]) {
      try {
        return await originalSignOut.apply(this, args);
      } catch (error) {
        console.error('[SafeClient] signOut出错:', error);
        return { error: null };
      }
    };

    // 包装刷新会话方法
    if (client.auth._refreshSession) {
      const originalRefreshSession = client.auth._refreshSession;
      client.auth._refreshSession = async function(...args: any[]) {
        try {
          return await originalRefreshSession.apply(this, args);
        } catch (error) {
          console.error('[SafeClient] _refreshSession出错:', error);
          return { data: { session: null }, error };
        }
      };
    }

    // 包装内部loadSession方法
    if (client.auth.__loadSession) {
      const originalLoadSession = client.auth.__loadSession;
      client.auth.__loadSession = async function(...args: any[]) {
        try {
          return await originalLoadSession.apply(this, args);
        } catch (error) {
          console.error('[SafeClient] __loadSession出错:', error);
          return { data: { session: null }, error };
        }
      };
    }

    console.log('[SafeClient] 已增强客户端方法');
  } catch (error) {
    console.error('[SafeClient] 增强客户端方法失败:', error);
  }
} 