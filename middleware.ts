import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";
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
    // 创建中间件客户端
    const supabase = createMiddlewareClient({ req: request, res: NextResponse.next() });
    
    // 获取当前会话
    const { data: { session } } = await supabase.auth.getSession();
    
    // 获取请求URL
    const requestUrl = new URL(request.url);
    const isSignInPage = requestUrl.pathname === '/sign-in';
    
    // 如果用户已登录且访问登录页面，重定向到保护页面
    if (session && isSignInPage) {
      console.log('[Middleware] 用户已登录，从登录页重定向到保护页面');
      const redirectUrl = new URL('/protected', request.url);
      return NextResponse.redirect(redirectUrl);
    }
    
    // 检查是否有强制跳过中间件的标记
    const skipMiddleware = request.nextUrl.searchParams.get('skip_middleware');
    if (skipMiddleware === 'true') {
      console.log('[中间件] 检测到跳过中间件标记，直接放行');
      return NextResponse.next();
    }
    
    // 检查受保护页面URL中的auth_session参数（登录成功标志）
    const hasAuthSession = request.nextUrl.searchParams.has('auth_session');
    if (request.nextUrl.pathname.startsWith('/protected') && hasAuthSession) {
      console.log('[中间件] 检测到auth_session参数，清除所有登出标记');
      
      // 创建响应
      const response = NextResponse.next();
      
      // 清除所有登出标记
      const cookiesToClear = ['force_logged_out', 'isLoggedOut', 'auth_logged_out', 'logged_out'];
      cookiesToClear.forEach(name => {
        response.cookies.set(name, '', {
          path: '/',
          expires: new Date(0),
          maxAge: 0
        });
      });
      
      // 设置强制登录标记
      response.cookies.set('force_login', 'true', {
        path: '/',
        maxAge: 3600, // 1小时有效期
        sameSite: 'lax'
      });
      
      // 设置会话验证标记
      response.cookies.set('session_verified', 'true', {
        path: '/',
        maxAge: 3600, // 1小时有效期
        sameSite: 'lax'
      });
      
      return response;
    }
    
    // 检查是否是浏览器扩展环境
    const isExtension = isExtensionEnvironment(request);
    if (isExtension) {
      console.log('[中间件] 检测到可能的扩展环境，特殊处理');
      
      // 对于扩展环境，如果URL包含auth_session参数，优先信任该参数
      if (hasAuthSession) {
        console.log('[中间件] 扩展环境下检测到auth_session参数，强制视为已登录');
        
        // 创建响应
        const response = NextResponse.next();
        
        // 清除所有登出标记
        const cookiesToClear = ['force_logged_out', 'isLoggedOut', 'auth_logged_out', 'logged_out'];
        cookiesToClear.forEach(name => {
          response.cookies.set(name, '', {
            path: '/',
            expires: new Date(0),
            maxAge: 0
          });
        });
        
        // 设置扩展环境标记
        response.cookies.set('is_extension_env', 'true', {
          path: '/',
          maxAge: 86400, // 24小时
          sameSite: 'lax'
        });
        
        return response;
      }
    }
    
    // 使用Supabase会话更新逻辑
    return await updateSession(request);
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
    '/protected/:path*',
    // 排除静态资源和API路由
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
