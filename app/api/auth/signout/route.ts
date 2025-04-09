import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    console.log('[API] 处理用户登出请求');
    const supabase = await createClient();
    
    // 执行Supabase登出
    await supabase.auth.signOut();
    
    console.log('[API] 用户登出成功');
    
    // 返回成功响应，并设置清除身份验证cookie的头
    const response = NextResponse.json({ 
      success: true,
      message: "登出成功，所有会话数据已清除",
      timestamp: new Date().toISOString()
    });
    
    // 清除所有认证相关的cookie
    const cookiesToClear = [
      'sb-access-token',
      'sb-refresh-token',
      'user_authenticated',
      'force_login',
      '__session',
      'auth_valid',
      'auth_time'
    ];
    
    cookiesToClear.forEach(name => {
      response.cookies.set(name, '', { 
        maxAge: 0,
        path: '/',
        expires: new Date(0)
      });
    });
    
    // 设置登出标记cookie
    response.cookies.set('logged_out', 'true', {
      maxAge: 60 * 60, // 1小时有效
      path: '/',
      httpOnly: false // 允许JavaScript访问
    });
    
    // 设置防缓存头部
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    
    return response;
  } catch (error) {
    console.error('[API] 登出过程中出错:', error);
    return NextResponse.json(
      { error: '登出过程中发生错误' },
      { status: 500 }
    );
  }
}

// 支持GET请求，与POST行为相同
export async function GET() {
  return POST();
} 