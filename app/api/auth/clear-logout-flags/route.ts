import { NextResponse } from "next/server";

export async function GET(request: Request) {
  console.log('[API] 处理清除登出标记请求');
  
  // 创建响应
  const response = NextResponse.json({ 
    success: true, 
    message: "登出标记已清除" 
  });
  
  // 清除登出标记cookie - 多种方式确保彻底清除
  response.cookies.delete('logged_out');
  
  // 使用多种方式清除cookie
  response.cookies.set('logged_out', '', {
    path: '/',
    expires: new Date(0),
    maxAge: 0
  });
  
  // 设置一个强制登录标记，有效期长一些
  response.cookies.set('force_login', 'true', {
    path: '/',
    maxAge: 60 * 60, // 1小时有效
    httpOnly: true,
    sameSite: 'lax'
  });
  
  // 设置头部指示进一步操作
  response.headers.set('X-Clear-Logout-Flags', 'true');
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  
  console.log('[API] 成功清除登出标记并设置强制登录标记');
  return response;
}

export async function POST(request: Request) {
  // 处理POST请求，功能与GET相同
  return GET(request);
} 