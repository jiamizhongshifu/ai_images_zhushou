import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// 获取站点URL
const SITE_URL = 'https://www.imgtutu.ai';

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const redirectTo = requestUrl.searchParams.get("redirect_to") || '/protected';
    
    console.log('[Auth Callback] 收到请求:', {
      url: request.url,
      code: code ? '存在' : '不存在',
      redirectTo
    });
    
    if (!code) {
      console.error('[Auth Callback] 没有提供授权码');
      throw new Error('No code provided');
    }

    const supabase = await createClient();
    
    // 交换授权码获取会话
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error('[Auth Callback] 交换会话失败:', error);
      throw error;
    }

    if (!data.session) {
      console.error('[Auth Callback] 没有获取到有效会话');
      throw new Error('No valid session received');
    }

    console.log('[Auth Callback] 成功获取会话');

    // 构建重定向URL - 添加更多参数确保客户端能识别登录状态
    const finalRedirectUrl = new URL(redirectTo, SITE_URL);
    const timestamp = Date.now().toString();
    finalRedirectUrl.searchParams.set('auth_session', timestamp);
    finalRedirectUrl.searchParams.set('login_success', 'true');
    finalRedirectUrl.searchParams.set('session_created', timestamp);
    
    // 添加额外的会话标识，帮助客户端识别登录状态
    const response = NextResponse.redirect(finalRedirectUrl.toString());
    
    // 设置cookie以帮助跨域识别认证状态
    response.cookies.set('auth_valid', 'true', { 
      path: '/', 
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7 // 7天
    });
    
    response.cookies.set('auth_time', timestamp, { 
      path: '/', 
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7 // 7天
    });

    // 设置会话相关cookie
    response.cookies.set('sb-access-token', data.session.access_token, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7 // 7天
    });

    if (data.session.refresh_token) {
      response.cookies.set('sb-refresh-token', data.session.refresh_token, {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30 // 30天
      });
    }

    console.log('[Auth Callback] 重定向到:', finalRedirectUrl.toString());
    
    return response;
  } catch (error) {
    console.error('[Auth Callback] 处理回调失败:', error);
    
    // 发生错误时重定向到登录页面
    const errorUrl = new URL('/sign-in', SITE_URL);
    errorUrl.searchParams.set('error', '登录失败，请重试');
    errorUrl.searchParams.set('error_description', error instanceof Error ? error.message : '未知错误');
    
    return NextResponse.redirect(errorUrl.toString());
  }
}
