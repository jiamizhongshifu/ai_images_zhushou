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
    const isAuthenticated = !!session?.user;
    
    // 记录用户状态
    logger.info(`路径: ${request.nextUrl.pathname}, 用户状态: ${isAuthenticated ? '已登录' : '未登录'}`);
    
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
