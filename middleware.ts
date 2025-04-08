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
