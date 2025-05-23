import { type NextRequest, NextResponse } from "next/server";

// 简化的中间件函数，不使用动态代码生成
export async function middleware(request: NextRequest) {
  // 创建响应
  const response = NextResponse.next();
  
  // 检查是否访问受保护页面且未登录
  if (request.nextUrl.pathname.startsWith('/protected')) {
    // 检查是否有强制登录cookie
    const forceLogin = request.cookies.get('force_login');
    if (forceLogin && forceLogin.value === 'true') {
      return response;
    }
    
    // 检查是否有access token cookie
    const accessToken = request.cookies.get('sb-access-token');
    if (!accessToken) {
      // 重定向到登录页
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
  }
  
  // 继续请求
  return response;
}

// 中间件匹配配置
export const config = {
  matcher: [
    // 排除静态资源
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};