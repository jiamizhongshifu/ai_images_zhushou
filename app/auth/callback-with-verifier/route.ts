import { getSupabase } from '@/lib/supabaseClient';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const codeVerifier = requestUrl.searchParams.get('code_verifier');
  const state = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const source = requestUrl.searchParams.get('source'); // 跟踪请求来源
  
  console.log(`[CallbackWithVerifier] 处理带 verifier 的 OAuth 回调，参数: { code: ${Boolean(code)}, code_verifier: ${Boolean(codeVerifier)}, state: ${Boolean(state)}, error: ${Boolean(error)}, source: ${source || 'unknown'} }`);
  
  // 检查是否有错误参数
  if (error) {
    console.error(`[CallbackWithVerifier] OAuth 错误: ${error}, 描述: ${errorDescription}`);
    return createErrorResponse('/sign-in', requestUrl.origin, `授权错误: ${errorDescription || error}`);
  }
  
  // 检查是否有 code 和 code_verifier 参数
  if (!code || !codeVerifier) {
    console.error('[CallbackWithVerifier] 缺少 code 或 code_verifier 参数，无法处理登录');
    return createErrorResponse('/sign-in', requestUrl.origin, '登录处理缺少必要参数，请重试');
  }
  
  try {
    // 获取 Supabase 客户端
    console.log('[CallbackWithVerifier] 获取 Supabase 客户端');
    const supabase = getSupabase();
    
    console.log('[CallbackWithVerifier] 尝试使用 code_verifier 交换会话');
    
    // 尝试使用 API 直接交换
    try {
      // 构建 API URL
      const exchangeUrl = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=pkce`);
      
      // 发送 POST 请求
      const response = await fetch(exchangeUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        },
        body: new URLSearchParams({
          'code': code,
          'code_verifier': codeVerifier,
        }).toString(),
      });
      
      // 检查响应
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[CallbackWithVerifier] 直接交换失败:', errorData);
        throw new Error(errorData.error_description || errorData.error || '交换会话失败');
      }
      
      console.log('[CallbackWithVerifier] 直接交换成功，获取会话');
    } catch (apiError) {
      console.error('[CallbackWithVerifier] API 交换出错:', apiError);
    }
    
    // 再次尝试使用标准方法
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    
    // 处理交换错误
    if (exchangeError) {
      console.error('[CallbackWithVerifier] 交换会话失败:', exchangeError.message);
      
      // 对于 PKCE 相关错误，使用更友好的错误信息
      let errorMessage = exchangeError.message;
      if (errorMessage.includes('code verifier')) {
        errorMessage = '登录验证失败：请清除浏览器缓存并重试，或尝试使用邮箱密码登录';
      }
      
      return createErrorResponse('/sign-in', requestUrl.origin, `登录失败: ${errorMessage}`);
    }
    
    // 检查会话是否创建成功
    if (!data || !data.session) {
      console.error('[CallbackWithVerifier] 交换成功但没有返回会话数据');
      return createErrorResponse('/sign-in', requestUrl.origin, '会话创建失败，请重试');
    }
    
    // 会话创建成功，重定向到受保护页面
    console.log('[CallbackWithVerifier] 会话验证通过，重定向到受保护页面');
    const redirectUrl = new URL('/protected', requestUrl.origin);
    redirectUrl.searchParams.set('login_success', 'true');
    redirectUrl.searchParams.set('auth_session', Date.now().toString());
    
    return NextResponse.redirect(redirectUrl);
    
  } catch (error) {
    // 捕获并记录所有未处理的错误
    console.error('[CallbackWithVerifier] 处理过程中发生未预期的错误:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return createErrorResponse('/sign-in', requestUrl.origin, `登录处理失败: ${errorMessage}`);
  }
}

// 创建错误响应
function createErrorResponse(path: string, origin: string, errorMessage: string = '授权错误'): NextResponse {
  const redirectUrl = new URL(path, origin);
  redirectUrl.searchParams.set('error', encodeURIComponent(errorMessage));
  // 添加 skip_middleware 参数避免中间件重定向循环
  redirectUrl.searchParams.set('skip_middleware', 'true');
  // 添加时间戳防止浏览器缓存
  redirectUrl.searchParams.set('ts', Date.now().toString());
  
  console.log(`[CallbackWithVerifier] 重定向到错误页面: ${redirectUrl.toString()}`);
  return NextResponse.redirect(redirectUrl);
} 