import { NextResponse } from "next/server";

export async function GET(request: Request) {
  console.log('[API] 处理清除登出标记请求');
  
  // 创建响应
  const response = NextResponse.json({ 
    success: true, 
    message: "登出标记已清除" 
  });
  
  // 清除所有可能的登出标记cookie
  response.cookies.delete('logged_out');
  response.cookies.delete('force_logged_out');
  response.cookies.delete('isLoggedOut');
  
  // 使用多种方式清除cookie，确保彻底删除
  const cookiesToClear = ['logged_out', 'force_logged_out', 'isLoggedOut'];
  cookiesToClear.forEach(cookieName => {
    response.cookies.set(cookieName, '', {
      path: '/',
      expires: new Date(0),
      maxAge: 0,
      sameSite: 'lax'
    });
  });
  
  // 设置一个强制登录标记，有效期长一些
  response.cookies.set('force_login', 'true', {
    path: '/',
    maxAge: 60 * 60, // 1小时有效
    httpOnly: false, // 允许JS访问以便前端可以检测
    sameSite: 'lax'
  });
  
  // 设置头部指示进一步操作
  response.headers.set('X-Clear-Logout-Flags', 'true');
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  
  console.log('[API] 成功清除所有登出标记并设置强制登录标记');
  return response;
}

export async function POST(request: Request) {
  // 处理POST请求，功能与GET相同
  return GET(request);
} 