import { NextRequest, NextResponse } from 'next/server';

// 需要认证的路径
const protectedPaths = ['/protected', '/dashboard', '/billing', '/settings', '/qa'];
// 认证路径
const authPaths = ['/sign-in', '/sign-up', '/forgot-password'];

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { pathname } = url;
  const cookies = request.cookies;
  
  // 获取请求参数
  const skipMiddleware = url.searchParams.get('skip_middleware') === 'true';
  const hasAuthParam = url.searchParams.has('code') || url.searchParams.has('auth_session');
  
  // 如果请求包含跳过中间件参数或是静态资源请求，直接返回
  if (skipMiddleware || pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|json)$/)) {
    return NextResponse.next();
  }
  
  // 改进 OAuth 回调检测逻辑
  if (pathname.startsWith('/auth/callback') || hasAuthParam) {
    console.log('[中间件] 检测到 OAuth 相关参数，跳过中间件处理');
    
    // 创建响应
    const response = NextResponse.next();
    
    // 清除所有登出标记
    response.cookies.delete('logged_out');
    response.cookies.delete('force_logged_out');
    response.cookies.delete('auth_logged_out');
    response.cookies.delete('isLoggedOut');
    
    return response;
  }
  
  // 解析认证状态 - 检查多种认证标记
  const isAuthenticated = cookies.has('user_authenticated') || 
                          cookies.has('sb-access-token') || 
                          cookies.has('sb-refresh-token');
  
  // 如果用户已登录且访问认证页面，重定向到保护页
  if (isAuthenticated && authPaths.some(p => pathname.startsWith(p))) {
    console.log('[中间件] 用户已登录，重定向到保护页');
    return NextResponse.redirect(new URL('/protected', request.url));
  }
  
  // 如果用户未登录且访问受保护路径，重定向到登录页
  if (!isAuthenticated && protectedPaths.some(p => pathname.startsWith(p))) {
    console.log('[中间件] 用户未登录，重定向到登录页');
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  
  return NextResponse.next();
}

// 配置中间件处理的路径
export const config = {
  matcher: [
    // 需要处理的路径
    '/protected/:path*',
    '/dashboard/:path*',
    '/settings/:path*',
    '/billing/:path*',
    '/qa/:path*',
    '/sign-in/:path*',
    '/sign-up/:path*',
    '/forgot-password/:path*',
    '/auth/callback/:path*',
    '/'
  ]
};
