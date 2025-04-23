import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  try {
    console.log('[Auth Callback] 开始处理认证回调');
    
  const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const error = requestUrl.searchParams.get('error');
    const error_description = requestUrl.searchParams.get('error_description');

    // 如果有错误参数，重定向到登录页面并显示错误
    if (error || error_description) {
      console.error('[Auth Callback] OAuth错误:', error, error_description);
      return NextResponse.redirect(
        `${requestUrl.origin}/sign-in?error=${encodeURIComponent(error_description || error || '认证失败')}`
      );
    }

    // 如果没有授权码，重定向到登录页
    if (!code) {
      console.error('[Auth Callback] 未收到授权码');
      return NextResponse.redirect(
        `${requestUrl.origin}/sign-in?error=${encodeURIComponent('未收到授权码')}`
      );
    }

    // 创建Supabase客户端并交换会话
    console.log('[Auth Callback] 开始交换授权码获取会话');
    const supabase = await createClient();

    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError) {
      console.error('[Auth Callback] 交换会话失败:', sessionError);
      return NextResponse.redirect(
        `${requestUrl.origin}/sign-in?error=${encodeURIComponent(sessionError.message)}`
      );
    }

    // 获取当前会话以验证
    const { data: { session } } = await supabase.auth.getSession();
      
    if (!session) {
      console.error('[Auth Callback] 无法获取有效会话');
      return NextResponse.redirect(
        `${requestUrl.origin}/sign-in?error=${encodeURIComponent('无法获取有效会话')}`
      );
  }

    console.log('[Auth Callback] 认证成功，重定向到受保护页面');

    // 创建响应并设置 cookie
    const response = NextResponse.redirect(`${requestUrl.origin}/protected`);

    // 设置认证相关的 cookie
    response.cookies.set('user_authenticated', 'true', {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      httpOnly: true
    });

    return response;
      
  } catch (error) {
    console.error('[Auth Callback] 处理认证回调时出错:', error);
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent('认证过程出现错误')}`
    );
  }
}
