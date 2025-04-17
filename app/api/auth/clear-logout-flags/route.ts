import { NextResponse } from "next/server";

/**
 * 清除所有登出标记的API端点
 * 用于解决浏览器扩展环境下存储访问限制问题
 */
export async function GET(request: Request) {
  console.log('[API] 处理清除登出标记请求');
  
  // 创建响应
  const response = NextResponse.json({ 
    success: true, 
    message: "登出标记已清除",
    timestamp: Date.now()
  });
  
  // 清除所有可能的登出标记cookie
  const cookiesToClear = [
    'logged_out', 
    'force_logged_out', 
    'isLoggedOut',
    'auth_logged_out'
  ];
  
  cookiesToClear.forEach(cookieName => {
    // 使用多种方式清除cookie，确保彻底删除
    response.cookies.set(cookieName, '', {
      path: '/',
      expires: new Date(0),
      maxAge: 0,
      sameSite: 'lax'
    });
  });
  
  // 设置强制登录标记，覆盖任何登出检测
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
  
  // 设置头部指示进一步操作
  response.headers.set('X-Clear-Logout-Flags', 'true');
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  
  console.log('[API] 成功清除所有登出标记');
  return response;
}

// 同样支持POST请求，方便不同场景使用
export async function POST(request: Request) {
  return GET(request);
} 