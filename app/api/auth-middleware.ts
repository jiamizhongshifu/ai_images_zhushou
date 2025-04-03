import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function withApiAuth(
  req: Request, 
  handler: (user: any, supabase: any) => Promise<Response>
) {
  try {
    // 获取cookie存储
    const cookieStore = cookies();
    
    // 创建Supabase服务器客户端
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          get(name: string) {
            // 处理多种可能的Cookie名称格式
            if (name === 'sb-wcjctczyzibrswwngmvd-auth-token' || name === 'sb-wcjctczyzibrswwngmvd-auth-token.0') {
              // 先尝试新格式Cookie
              const accessToken = cookieStore.get('sb-access-token');
              if (accessToken?.value) {
                return accessToken.value;
              }
              
              // 再尝试旧格式Cookie
              const oldFormatCookie = cookieStore.get(name);
              return oldFormatCookie?.value;
            }
            
            // 常规Cookie查找
            const cookie = cookieStore.get(name);
            return cookie?.value;
          },
          set(name: string, value: string, options: any) {
            try {
              cookieStore.set(name, value, options);
            } catch (e) {
              console.warn('[API中间件] Cookie设置错误，这在路由处理程序中是正常的', e);
            }
          },
          remove(name: string, options: any) {
            try {
              cookieStore.delete(name, options);
            } catch (e) {
              console.warn('[API中间件] Cookie删除错误，这在路由处理程序中是正常的', e);
            }
          },
        },
      }
    );

    // 获取会话信息前先手动检查Cookie是否存在
    const hasAccessToken = cookieStore.get('sb-access-token');
    const hasRefreshToken = cookieStore.get('sb-refresh-token');
    const hasConfirmedSession = cookieStore.get('sb-session-confirmed');
    
    if (hasAccessToken && hasRefreshToken) {
      console.log('[API中间件] 检测到认证Cookie:', req.url);
    }
    
    // 获取会话信息
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.log('[API中间件] 未授权访问:', req.url, '错误:', error?.message);
      
      // 如果有会话确认Cookie但获取用户失败，尝试使用手动认证
      if (hasConfirmedSession?.value === 'true' && (hasAccessToken || hasRefreshToken)) {
        console.log('[API中间件] 检测到会话确认Cookie，尝试使用localStorage中的令牌');
        
        // 返回特殊状态码让客户端知道需要使用localStorage中的令牌
        return new Response(JSON.stringify({
          success: false,
          error: 'session_restore_required',
          message: '会话需要恢复，请使用localStorage中的令牌'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 未认证，直接返回401
      return new Response(JSON.stringify({ 
        success: false, 
        error: '未授权访问，请先登录' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 检查会话是否有效
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session) {
      console.log('[API中间件] 会话无效或已过期:', req.url);
      return new Response(JSON.stringify({ 
        success: false, 
        error: '会话已过期，请重新登录' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 用户已认证，调用处理程序
    console.log('[API中间件] 用户已认证，处理请求:', req.url, 'userId:', user.id);
    return await handler(user, supabase);
  } catch (error: any) {
    console.error('[API中间件] 处理请求出错:', error.message || error);
    
    // 返回500错误
    return new Response(JSON.stringify({ 
      success: false, 
      error: '服务器内部错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 