import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    console.log('[API] 处理用户登出请求');
    const supabase = await createClient();
    
    await supabase.auth.signOut();
    
    console.log('[API] 用户登出成功');
    
    // 返回成功响应，并设置清除身份验证cookie的头
    const response = NextResponse.json({ success: true });
    
    // 显式清除Supabase会话cookie
    response.cookies.set('sb-access-token', '', { 
      maxAge: 0,
      path: '/',
    });
    
    response.cookies.set('sb-refresh-token', '', { 
      maxAge: 0,
      path: '/',
    });
    
    return response;
  } catch (error) {
    console.error('[API] 登出过程中出错:', error);
    return NextResponse.json(
      { error: '登出过程中发生错误' },
      { status: 500 }
    );
  }
} 