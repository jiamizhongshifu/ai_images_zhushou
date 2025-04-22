import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: NextRequest) {
  // 获取当前 URL
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  
  console.log('[AuthCallback] 处理 OAuth 回调，参数:', { code: !!code, state: !!state });
  
  try {
    // 尝试在 URL 中检测 OAuth 相关参数
    if (code && state) {
      console.log('[AuthCallback] 检测到 OAuth 回调参数，处理中...');
      
      // 等待一段时间让 Supabase 客户端处理 OAuth
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 检查会话状态
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('[AuthCallback] 获取会话失败:', error);
        return createErrorResponse('/sign-in', requestUrl.origin);
      }
      
      if (data.session) {
        console.log('[AuthCallback] 成功获取会话，用户:', data.session.user.email);
        return createSuccessResponse('/', requestUrl.origin);
      }
      
      // 尝试交换 code 获取会话
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      
      if (exchangeError) {
        console.error('[AuthCallback] 交换 code 失败:', exchangeError);
        return createErrorResponse('/sign-in', requestUrl.origin);
      }
      
      // 再次检查会话
      const { data: refreshedData } = await supabase.auth.getSession();
      
      if (refreshedData.session) {
        console.log('[AuthCallback] 交换 code 后成功获取会话');
        return createSuccessResponse('/', requestUrl.origin);
      }
    }
    
    // 处理其他情况
    console.warn('[AuthCallback] 未检测到有效的 OAuth 参数或会话');
    return createErrorResponse('/sign-in', requestUrl.origin);
  } catch (err) {
    console.error('[AuthCallback] 处理 OAuth 回调时出错:', err);
    return createErrorResponse('/sign-in', requestUrl.origin);
  }
}

// 创建成功响应
function createSuccessResponse(redirectPath: string, origin: string) {
  const response = NextResponse.redirect(new URL(redirectPath, origin));
  
  // 清除所有登出标记
  const cookiesToClear = ['force_logged_out', 'isLoggedOut', 'auth_logged_out', 'logged_out'];
  cookiesToClear.forEach(name => {
    response.cookies.delete(name);
  });
  
  // 设置认证 cookie
  response.cookies.set('user_authenticated', 'true', { 
    path: '/',
    maxAge: 60 * 60 * 24, // 24 小时
    sameSite: 'lax',
    secure: true,
    httpOnly: false // 允许 JavaScript 访问
  });
  
  return response;
}

// 创建错误响应
function createErrorResponse(redirectPath: string, origin: string) {
  const redirectUrl = new URL(redirectPath, origin);
  redirectUrl.searchParams.set('error', 'auth_error');
  return NextResponse.redirect(redirectUrl);
}
