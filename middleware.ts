import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

// 身份验证中间件
export async function middleware(request: NextRequest) {
  // 使用Supabase会话更新逻辑
  return await updateSession(request);
}

// 中间件匹配配置
export const config = {
  matcher: [
    // 排除静态资源和API路由
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
