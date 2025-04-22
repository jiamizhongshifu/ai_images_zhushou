import { getSupabase } from '@/lib/supabaseClient';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  
  console.log(`[AuthCallback] 处理 OAuth 回调，参数: { code: ${Boolean(code)}, state: ${Boolean(state)}, error: ${Boolean(error)} }`);
  
  // 检查是否有错误参数
  if (error) {
    console.error(`[AuthCallback] OAuth 错误: ${error}, 描述: ${errorDescription}`);
    return createErrorResponse('/sign-in', requestUrl.origin, `授权错误: ${errorDescription || error}`);
  }
  
  // 检查是否有 code 参数
  if (!code) {
    console.error('[AuthCallback] 缺少 code 参数，无法处理登录');
    return createErrorResponse('/sign-in', requestUrl.origin, '登录过程中断，请重试');
  }
  
  try {
    // 获取 Supabase 客户端
    console.log('[AuthCallback] 获取 Supabase 客户端');
    const supabase = getSupabase();
    
    // 尝试交换 code 获取会话
    console.log('[AuthCallback] 开始交换 code 获取会话');
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    
    // 处理交换错误
    if (exchangeError) {
      console.error('[AuthCallback] 交换会话失败:', exchangeError.message);
      return createErrorResponse('/sign-in', requestUrl.origin, `登录失败: ${exchangeError.message}`);
    }
    
    // 确认数据存在
    if (!data || !data.session) {
      console.error('[AuthCallback] 交换成功但没有返回会话数据');
      return createErrorResponse('/sign-in', requestUrl.origin, '会话创建失败，请重试');
    }
    
    // 再次检查会话状态
    console.log('[AuthCallback] 交换成功，检查会话状态');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    // 处理会话检查错误
    if (sessionError) {
      console.error('[AuthCallback] 检查会话状态失败:', sessionError.message);
      return createErrorResponse('/sign-in', requestUrl.origin, '无法验证会话状态');
    }
    
    // 验证会话有效性
    if (!sessionData?.session) {
      console.error('[AuthCallback] 获取到的会话无效');
      
      // 等待一段时间后再次检查，防止会话数据延迟可用
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data: retryData } = await supabase.auth.getSession();
      
      if (!retryData?.session) {
        console.error('[AuthCallback] 重试后会话仍然无效');
        return createErrorResponse('/sign-in', requestUrl.origin, '会话验证失败，请重试');
      }
      
      console.log('[AuthCallback] 重试后获取到有效会话');
    }
    
    // 成功登录，重定向到受保护页面
    console.log('[AuthCallback] 会话验证通过，重定向到受保护页面');
    const redirectUrl = new URL('/protected', requestUrl.origin);
    redirectUrl.searchParams.set('login_success', 'true');
    redirectUrl.searchParams.set('auth_session', Date.now().toString());
    
    return NextResponse.redirect(redirectUrl);
    
  } catch (error) {
    // 捕获并记录所有未处理的错误
    console.error('[AuthCallback] 处理过程中发生未预期的错误:', error);
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
  
  console.log(`[AuthCallback] 重定向到错误页面: ${redirectUrl.toString()}`);
  return NextResponse.redirect(redirectUrl);
}
