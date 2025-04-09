import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// 创建Supabase中间件客户端函数
export function createClient(request: NextRequest) {
  // 从环境变量中读取URL和ANON KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  // 创建一个不自动设置cookies的客户端
  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          // 中间件只能在响应中设置cookie，这里我们不需要实现
        },
        remove(name, options) {
          // 中间件只能在响应中删除cookie，这里我们不需要实现
        },
      },
    }
  );
}

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
    console.error(`[中间件错误] ${message}`);
  },
  warn: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn(`[中间件警告] ${message}`);
    }
  },
  info: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      console.log(`[中间件] ${message}`);
    }
  },
  debug: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.log(`[中间件调试] ${message}`);
    }
  }
};

// 保存最近的重定向记录，防止重定向循环
let lastRedirectInfo: { url: string; timestamp: number; count: number } | null = null;
const REDIRECT_TIMEOUT = 5000; // 5秒内不重复相同重定向
const MAX_REDIRECTS = 3; // 最大重定向次数

export const updateSession = async (request: NextRequest) => {
  try {
    // 添加调试信息
    logger.debug(`处理请求路径: ${request.nextUrl.pathname}, 方法: ${request.method}`);
    
    // 创建未修改的响应
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // 从环境变量中读取URL和ANON KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 验证环境变量存在
    if (!supabaseUrl || !supabaseAnonKey) {
      logger.error("缺少必要的Supabase环境变量");
      return response;
    }
    
    // 创建Supabase客户端
    const supabase = createClient(request);
    
    // 检查是否有有效会话
    const { data: { session } } = await supabase.auth.getSession();
    let isAuthenticated = !!session?.user;
    
    // 检查URL是否包含强制登录参数
    const url = new URL(request.url);
    const hasForceLoginParam = url.searchParams.has('force_login');
    const hasForceLoginCookie = request.cookies.get('force_login')?.value === 'true';
    const hasClearLogoutParam = url.searchParams.has('clear_logout_flags');
    // 新增：检查会话验证参数
    const hasSessionVerifiedParam = url.searchParams.has('session_verified');
    const verifyTime = url.searchParams.get('verify_time');
    // 验证来源时间戳的新鲜度（5分钟内）
    const isVerifyTimeValid = verifyTime && 
                              (Date.now() - parseInt(verifyTime, 10)) < 5 * 60 * 1000;
    
    // 记录详细参数
    logger.debug(`认证相关参数: force_login=${hasForceLoginParam}, force_login_cookie=${hasForceLoginCookie}, clear_logout=${hasClearLogoutParam}, session_verified=${hasSessionVerifiedParam}, verify_time_valid=${isVerifyTimeValid}`);
    
    // 验证会话有效性 - 只有当存在真实有效的会话时，强制登录参数才有效
    const sessionIsValid = !!session?.user;
    
    // 记录会话状态
    logger.debug(`会话状态: ${sessionIsValid ? '有效' : '无效'}, 用户ID: ${session?.user?.id || '无'}`);
    
    // 判断是否应该应用强制登录逻辑：
    // 1. 有会话验证参数且时间有效
    // 2. 有强制登录参数/Cookie，且会话确实有效
    // 3. 有清除登出标记请求
    const shouldForceLogin = 
      (hasSessionVerifiedParam && isVerifyTimeValid) || 
      ((hasForceLoginParam || hasForceLoginCookie) && sessionIsValid) ||
      hasClearLogoutParam;
    
    // 如果满足条件，优先处理，清除所有登出标记
    if (shouldForceLogin) {
      logger.info(`路径: ${request.nextUrl.pathname}, 检测到有效的认证标记和有效会话，清除所有登出状态`);
      
      // 清除登出Cookie
      response.cookies.delete('force_logged_out');
      
      // 如果有会话，设置认证状态
      if (sessionIsValid) {
        logger.info(`路径: ${request.nextUrl.pathname}, 确认有效会话，强制设置用户状态为已登录`);
        isAuthenticated = true;
        
        // 设置验证过的会话Cookie，确保后续请求不受登出标记影响
        if (hasSessionVerifiedParam && isVerifyTimeValid) {
          response.cookies.set('session_verified', 'true', {
            path: '/',
            maxAge: 60 * 10, // 10分钟过期
            httpOnly: false,
            sameSite: 'lax'
          });
        }
        
        // 如果是通过force_login参数，记录但不自动延长有效期
        if (hasForceLoginParam && sessionIsValid) {
          logger.debug(`路径: ${request.nextUrl.pathname}, 处理force_login参数，有效会话已确认`);
        }
      } else {
        logger.warn(`路径: ${request.nextUrl.pathname}, 虽然有强制登录标记，但未检测到有效会话，不强制登录`);
      }
    } 
    // 仅当没有强制登录请求时，才检查登出标记
    else {
      // 检查URL是否包含登出参数，如果有，则认为用户已登出，不考虑会话状态
      const hasLogoutParam = url.searchParams.has('logout') || url.searchParams.has('force_logout');
      
      // 检查Cookies中的登出标记
      const hasLogoutCookie = request.cookies.get('force_logged_out')?.value === 'true';
      
      // 如果检测到登出参数或登出Cookie，强制认为用户未登录，无论会话状态如何
      if (hasLogoutParam || hasLogoutCookie) {
        logger.info(`路径: ${request.nextUrl.pathname}, 检测到登出标记，强制设置用户状态为未登录`);
        isAuthenticated = false;
        
        // 设置登出Cookie，确保后续请求也能识别登出状态
        response.cookies.set('force_logged_out', 'true', {
          path: '/',
          maxAge: 60 * 5, // 5分钟过期，足够处理登出后的短期访问
          httpOnly: false,
          sameSite: 'lax'
        });
        
        // 删除认证Cookie
        response.cookies.delete('user_authenticated');
        // 删除强制登录Cookie
        response.cookies.delete('force_login');
      }
    }
    
    // 记录用户状态
    logger.info(`路径: ${request.nextUrl.pathname}, 最终用户状态: ${isAuthenticated ? '已登录' : '未登录'}`);
    
    // 访问受保护页面但未登录时重定向
    if (request.nextUrl.pathname.startsWith('/protected') && !isAuthenticated) {
      // 检查是否有nav_direct参数（从导航直接访问）
      const navDirect = request.nextUrl.searchParams.get('nav_direct');
      
      if (navDirect === 'true') {
        // 如果是从导航直接访问，添加重定向参数
        const redirectUrl = new URL('/sign-in', request.url);
        redirectUrl.searchParams.set('redirect', request.nextUrl.pathname);
        return NextResponse.redirect(redirectUrl);
      }
      
      // 正常重定向到登录页
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
    
    // 用户已登录时设置一个标记cookie，前端可用于快速检查
    if (isAuthenticated) {
      response.cookies.set('user_authenticated', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24, // 1天
        httpOnly: false, // 允许JavaScript访问
        sameSite: 'lax'
      });
    } else {
      // 未登录时删除此cookie
      response.cookies.delete('user_authenticated');
    }
    
    return response;
  } catch (error) {
    logger.error(`中间件处理请求出错: ${error instanceof Error ? error.message : String(error)}`);
    // 错误时返回原始响应，避免阻塞请求
    return NextResponse.next();
  }
};
