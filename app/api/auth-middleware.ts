import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SupabaseClient, User } from '@supabase/supabase-js';

// 设置日志级别常量
const LOG_LEVELS = {
  ERROR: 0,    // 只显示错误
  WARN: 1,     // 显示警告和错误
  INFO: 2,     // 显示信息、警告和错误
  DEBUG: 3     // 显示所有日志
};

// 获取环境变量中的日志级别，默认为INFO
const currentLogLevel = (() => {
  const level = process.env.LOG_LEVEL || 'INFO';
  switch (level.toUpperCase()) {
    case 'ERROR': return LOG_LEVELS.ERROR;
    case 'WARN': return LOG_LEVELS.WARN;
    case 'INFO': return LOG_LEVELS.INFO;
    case 'DEBUG': return LOG_LEVELS.DEBUG;
    default: return LOG_LEVELS.INFO;
  }
})();

// 日志工具函数
const logger = {
  error: (message: string) => {
    console.error(`[Auth中间件错误] ${message}`);
  },
  warn: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn(`[Auth中间件警告] ${message}`);
    }
  },
  info: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      console.log(`[Auth中间件] ${message}`);
    }
  },
  debug: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.log(`[Auth中间件调试] ${message}`);
    }
  }
};

/**
 * 在中间件中处理未认证用户
 */
export function handleUnauthenticated() {
  return Response.json(
    { success: false, message: "未授权访问" },
    { status: 401 }
  );
}

/**
 * 在API路由中处理未认证用户
 */
export function apiUnauthenticated() {
  return Response.json(
    { success: false, message: "未授权访问", needsAuth: true },
    { status: 401 }
  );
}

/**
 * 在服务端组件中创建安全的Supabase客户端
 * 可以处理未认证的会话或cookie问题
 */
export async function createSecureClient() {
  try {
    logger.debug("开始创建安全的Supabase客户端");
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            try {
              return cookieStore.get(name)?.value;
            } catch (error) {
              logger.error(`获取cookie '${name}' 失败: ${error}`);
              return undefined;
            }
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value, ...options });
            } catch (error) {
              logger.error(`设置cookie '${name}' 失败: ${error}`);
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: '', ...options });
            } catch (error) {
              logger.error(`移除cookie '${name}' 失败: ${error}`);
            }
          },
        },
      }
    );

    logger.debug("安全的Supabase客户端创建成功");
    return { supabase, cookieStore };
  } catch (error) {
    logger.error(`创建安全Supabase客户端失败: ${error}`);
    throw new Error(`创建安全Supabase客户端失败: ${error}`);
  }
}

// 获取用户ID的通用函数 - 使用getUser更安全
export async function getCurrentUser(supabase: SupabaseClient): Promise<User | null> {
  const { data: user } = await supabase.auth.getUser();
  return user?.user || null;
}

// 验证用户是否已登录的中间件
export async function validateLoggedIn(supabase: SupabaseClient): Promise<User | null> {
  const user = await getCurrentUser(supabase);
  return user;
}

export async function withApiAuth(
  req: Request, 
  handler: (user: any, supabase: any) => Promise<Response>
) {
  try {
    // 获取cookie存储
    const cookieStore = await cookies();
    
    // 创建Supabase服务器客户端
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          get(name: string) {
            // 处理多种可能的Cookie名称格式
            if (name === 'sb-wcjctczyzibrswwngmvd-auth-token' || name === 'sb-wcjctczyzibrswwngmvd-auth-token.0') {
              // 先尝试新格式Cookie
              const accessToken = cookieStore.get('sb-access-token');
              if (accessToken?.value) {
                return accessToken.value;
              }
              
              // 再尝试旧格式Cookie
              const oldFormatCookie = cookieStore.get(name);
              return oldFormatCookie?.value;
            }
            
            // 常规Cookie查找
            const cookie = cookieStore.get(name);
            return cookie?.value;
          },
          set(name: string, value: string, options?: CookieOptions) {
            try {
              // 添加明确的cookie选项以增强cookie稳定性
              const finalOptions = {
                ...options,
                // 确保cookie在整个域名下可用
                path: options?.path || "/",
                // 增加cookie持久性，默认为7天
                maxAge: options?.maxAge || 60 * 60 * 24 * 7,
                // 确保安全设置
                secure: process.env.NODE_ENV === "production",
                // 确保cookie可用于跨请求
                httpOnly: true,
                sameSite: "lax" as const
              };
              
              cookieStore.set(name, value, finalOptions);
            } catch (e) {
              logger.debug(`Cookie设置错误，这在路由处理程序中是正常的: ${e instanceof Error ? e.message : String(e)}`);
            }
          },
          remove(name: string, options?: CookieOptions) {
            try {
              cookieStore.set(name, "", { ...options, maxAge: 0 });
            } catch (e) {
              logger.debug(`Cookie删除错误，这在路由处理程序中是正常的: ${e instanceof Error ? e.message : String(e)}`);
            }
          },
        },
      }
    );

    // 获取会话信息前先手动检查Cookie是否存在
    const hasAccessToken = cookieStore.get('sb-access-token');
    const hasRefreshToken = cookieStore.get('sb-refresh-token');
    const hasConfirmedSession = cookieStore.get('sb-session-confirmed');
    
    if (hasAccessToken && hasRefreshToken) {
      logger.debug(`检测到认证Cookie: ${new URL(req.url).pathname}`);
    }
    
    // 获取会话信息
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      logger.warn(`未授权访问: ${new URL(req.url).pathname}, 错误: ${error?.message || '无用户'}`);
      
      // 如果有会话确认Cookie但获取用户失败，尝试使用手动认证
      if (hasConfirmedSession?.value === 'true' && (hasAccessToken || hasRefreshToken)) {
        logger.debug('检测到会话确认Cookie，尝试使用localStorage中的令牌');
        
        // 返回特殊状态码让客户端知道需要使用localStorage中的令牌
        return new Response(JSON.stringify({
          success: false,
          error: 'session_restore_required',
          message: '会话需要恢复，请使用localStorage中的令牌'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 未认证，直接返回401
      return new Response(JSON.stringify({ 
        success: false, 
        error: '未授权访问，请先登录' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 检查会话是否有效
    const { data: { user: sessionUser }, error: sessionError } = await supabase.auth.getUser();
    if (!sessionUser || sessionError) {
      logger.warn(`会话无效或已过期: ${new URL(req.url).pathname}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: '会话已过期，请重新登录' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 用户已认证，调用处理程序
    logger.debug(`用户已认证，处理请求: ${new URL(req.url).pathname}, userId: ${user.id}`);
    return await handler(user, supabase);
  } catch (error: any) {
    logger.error(`处理请求出错: ${error.message || error}`);
    
    // 返回500错误
    return new Response(JSON.stringify({ 
      success: false, 
      error: '服务器内部错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 