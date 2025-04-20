import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@/types/supabase';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json(
        { error: '邮箱地址不能为空' },
        { status: 400 }
      );
    }
    
    // 创建服务端 Supabase 客户端
    const supabase = createRouteHandlerClient<Database>({ cookies });
    
    // 重新发送验证邮件
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
      }
    });
    
    if (error) {
      console.error('[Auth] 重新发送验证邮件失败:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { message: '验证邮件已重新发送' },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Auth] 处理重新发送验证邮件请求失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
} 