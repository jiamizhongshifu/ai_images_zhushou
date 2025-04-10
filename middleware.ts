import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

// 身份验证中间件
export async function middleware(request: NextRequest) {
  try {
    // 如果是登录页面，直接放行，避免重定向循环
    if (request.nextUrl.pathname === '/sign-in') {
      console.log('[中间件] 检测到登录页面，直接放行');
      return NextResponse.next();
    }
    
    // 检查是否有强制跳过中间件的标记
    const skipMiddleware = request.nextUrl.searchParams.get('skip_middleware');
    if (skipMiddleware === 'true') {
      console.log('[中间件] 检测到跳过中间件标记，直接放行');
      return NextResponse.next();
    }
    
    // 优先检查登出状态，如果已登出，则直接处理
    const url = new URL(request.url);
    const hasLoggedOutParam = url.searchParams.has('logged_out') || 
                             url.searchParams.has('logout') || 
                             url.searchParams.has('force_logout');
    
    // 更严格地检查各种登出cookie
    const hasLogoutCookie = request.cookies.get('force_logged_out')?.value === 'true';
    const hasIsLoggedOutCookie = request.cookies.get('isLoggedOut')?.value === 'true';
    const hasAuthLoggedOutCookie = request.cookies.get('auth_logged_out')?.value === 'true';
    const hasLoggedOutCookie = request.cookies.get('logged_out')?.value === 'true';
    
    // 如果有任何登出标记，则快速处理
    if (hasLoggedOutParam || hasLogoutCookie || hasIsLoggedOutCookie || 
        hasAuthLoggedOutCookie || hasLoggedOutCookie) {
      console.log('[中间件] 检测到登出标记，优先处理登出状态');
      
      // 创建响应
      const response = NextResponse.next();
      
      // 确保设置登出cookie，前端可以检测
      response.cookies.set('force_logged_out', 'true', { 
        path: '/', 
        maxAge: 60 * 60 * 24, // 24小时
        httpOnly: false,
        sameSite: 'lax'
      });
      
      // 移除所有可能表示登录状态的cookie
      response.cookies.delete('user_authenticated');
      response.cookies.delete('force_login');
      response.cookies.delete('session_verified');
      
      // 如果是访问受保护页面，则重定向到登录页
      if (request.nextUrl.pathname.startsWith('/protected')) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
      }
      
      // 其他情况，放行请求
      return response;
    }
    
    // 使用Supabase会话更新逻辑
    return await updateSession(request);
  } catch (error) {
    console.error('[中间件错误]', error);
    // 发生错误时，直接放行请求，避免中间件错误阻止页面访问
    return NextResponse.next();
  }
}

// 中间件匹配配置
export const config = {
  matcher: [
    // 排除静态资源和API路由
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
