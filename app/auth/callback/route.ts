import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: NextRequest) {
  // 获取当前 URL
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  
  // 如果存在 OAuth 参数，则处理认证
  if (code && state) {
    try {
      console.log('[AuthCallback] 检测到 OAuth 回调参数, 处理中...');
      
      // 等待一段时间让 Supabase 客户端处理 OAuth
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 检查会话状态
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('[AuthCallback] 获取会话失败:', error);
        // 重定向到登录页面
        return NextResponse.redirect(new URL('/sign-in', requestUrl.origin));
      }
      
      if (data.session) {
        console.log('[AuthCallback] 成功获取会话，用户:', data.session.user.email);
        
        // 创建重定向响应
        const response = NextResponse.redirect(new URL('/', requestUrl.origin));
        
        // 设置认证 cookie
        response.cookies.set('user_authenticated', 'true', { 
          path: '/',
          maxAge: 60 * 60 * 24, // 24 小时
          sameSite: 'lax'
        });
        
        return response;
      }
    } catch (err) {
      console.error('[AuthCallback] 处理 OAuth 回调时出错:', err);
    }
  }
  
  // 默认重定向到首页
  return NextResponse.redirect(new URL('/', requestUrl.origin));
}
