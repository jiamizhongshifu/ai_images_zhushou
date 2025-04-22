import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // 创建Supabase客户端
  const supabase = await createClient();
  
  // 获取URL参数
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const code_verifier = requestUrl.searchParams.get('code_verifier');
  
  console.log('[CallbackWithVerifier] 收到请求参数:', { 
    code: code ? '存在' : '不存在',
    code_verifier: code_verifier ? '存在' : '不存在'
  });

  // 如果没有code或code_verifier，重定向到登录页
  if (!code || !code_verifier) {
    console.error('[CallbackWithVerifier] 缺少必要参数 code 或 code_verifier');
    return NextResponse.redirect(new URL('/sign-in?error=missing_params', request.url));
  }

  try {
    // 使用code完成身份验证 (code_verifier会自动从cookie中获取)
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error('[CallbackWithVerifier] 交换session失败:', error.message);
      return NextResponse.redirect(
        new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }

    // 成功登录后重定向到主页
    console.log('[CallbackWithVerifier] 身份验证成功，重定向到主页');
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    console.error('[CallbackWithVerifier] 处理登录过程中出错:', error);
    return NextResponse.redirect(
      new URL(`/sign-in?error=${encodeURIComponent('登录处理过程中出错')}`, request.url)
    );
  }
} 