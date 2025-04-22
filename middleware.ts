import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

// 检测是否可能是浏览器扩展环境的辅助函数
function isExtensionEnvironment(request: NextRequest): boolean {
  // 检查请求头中的标志
  const userAgent = request.headers.get('user-agent') || '';
  const referer = request.headers.get('referer') || '';
  const origin = request.headers.get('origin') || '';
  
  // Extension-specific indicators
  return (
    userAgent.includes('Chrome-Lighthouse') || 
    referer.includes('chrome-extension://') ||
    origin.includes('chrome-extension://') ||
    // 检查特殊URL参数，可以由扩展环境设置
    request.nextUrl.searchParams.has('extension_env') ||
    // 检查特殊cookie标记
    request.cookies.get('is_extension_env')?.value === 'true'
  );
}

// 身份验证中间件
export async function middleware(request: NextRequest) {
  try {
    // 创建响应对象
    const res = NextResponse.next();
    
    // 创建中间件客户端
    const supabase = createMiddlewareClient({ req: request, res });
    
    // 获取当前会话
    const { data: { session } } = await supabase.auth.getSession();
    
    // 获取请求URL
    const requestUrl = new URL(request.url);
    const isAuthPage = requestUrl.pathname === '/sign-in' || requestUrl.pathname === '/sign-up';
    const isProtectedPage = requestUrl.pathname.startsWith('/protected');
    
    // 如果是认证页面且用户已登录，重定向到保护页面
    if (session && isAuthPage) {
      console.log('[Middleware] 用户已登录，从认证页重定向到保护页面');
      return NextResponse.redirect(new URL('/protected', request.url));
    }
    
    // 如果是保护页面且用户未登录，重定向到登录页
    if (!session && isProtectedPage) {
      console.log('[Middleware] 用户未登录，从保护页重定向到登录页');
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
    
    // 检查是否有强制跳过中间件的标记
    const skipMiddleware = request.nextUrl.searchParams.get('skip_middleware');
    if (skipMiddleware === 'true') {
      console.log('[中间件] 检测到跳过中间件标记，直接放行');
      return res;
    }
    
    // 检查受保护页面URL中的auth_session参数（登录成功标志）
    const hasAuthSession = request.nextUrl.searchParams.has('auth_session');
    if (request.nextUrl.pathname.startsWith('/protected') && hasAuthSession) {
      console.log('[中间件] 检测到auth_session参数，清除所有登出标记');
      
      // 清除所有登出标记
      res.cookies.set('force_logged_out', '', {
        path: '/',
        expires: new Date(0),
        maxAge: 0
      });
      res.cookies.set('isLoggedOut', '', {
        path: '/',
        expires: new Date(0),
        maxAge: 0
      });
      res.cookies.set('auth_logged_out', '', {
        path: '/',
        expires: new Date(0),
        maxAge: 0
      });
      res.cookies.set('logged_out', '', {
        path: '/',
        expires: new Date(0),
        maxAge: 0
      });
      
      // 设置强制登录标记
      res.cookies.set('force_login', 'true', {
        path: '/',
        maxAge: 3600, // 1小时有效期
        sameSite: 'lax'
      });
      
      // 设置会话验证标记
      res.cookies.set('session_verified', 'true', {
        path: '/',
        maxAge: 3600, // 1小时有效期
        sameSite: 'lax'
      });
      
      return res;
    }
    
    // 检查是否是浏览器扩展环境
    const isExtension = isExtensionEnvironment(request);
    if (isExtension) {
      console.log('[中间件] 检测到可能的扩展环境，特殊处理');
      
      // 对于扩展环境，如果URL包含auth_session参数，优先信任该参数
      if (hasAuthSession) {
        console.log('[中间件] 扩展环境下检测到auth_session参数，强制视为已登录');
        
        // 清除所有登出标记
        res.cookies.set('force_logged_out', '', {
          path: '/',
          expires: new Date(0),
          maxAge: 0
        });
        res.cookies.set('isLoggedOut', '', {
          path: '/',
          expires: new Date(0),
          maxAge: 0
        });
        res.cookies.set('auth_logged_out', '', {
          path: '/',
          expires: new Date(0),
          maxAge: 0
        });
        res.cookies.set('logged_out', '', {
          path: '/',
          expires: new Date(0),
          maxAge: 0
        });
        
        // 设置扩展环境标记
        res.cookies.set('is_extension_env', 'true', {
          path: '/',
          maxAge: 86400, // 24小时
          sameSite: 'lax'
        });
        
        return res;
      }
    }
    
    // 如果用户已登录，设置认证cookie
    if (session) {
      res.cookies.set('user_authenticated', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      });
    } else {
      // 如果用户未登录，清除认证cookie
      res.cookies.set('user_authenticated', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0)
      });
    }
    
    return res;
  } catch (error) {
    console.error('[Middleware] 处理请求时出错:', error);
    // 发生错误时继续处理请求
    return NextResponse.next();
  }
}

// 中间件匹配配置
export const config = {
  matcher: [
    '/sign-in',
    '/sign-up',
    '/protected/:path*',
    // 排除静态资源和API路由
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
