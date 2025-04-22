import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(req: Request) {
  // 记录请求信息
  console.log('[直接API测试] 收到请求');
  
  try {
    // 获取请求头
    const authHeader = req.headers.get('authorization') || req.headers.get('x-auth-token');
    console.log('[直接API测试] 认证头:', authHeader ? `${authHeader.substring(0, 10)}...` : '无');
    
    // 记录所有请求头
    const headersLog: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headersLog[key] = value;
    });
    console.log('[直接API测试] 所有请求头:', headersLog);
    
    // 获取cookie存储
    const cookieStore = await cookies();
    console.log('[直接API测试] Cookie存储类型:', typeof cookieStore);
    
    // 记录相关cookie
    const authCookies = [
      cookieStore.get('sb-access-token'),
      cookieStore.get('sb-refresh-token'),
      cookieStore.get('supabase-auth-token')
    ].filter(Boolean);
    
    console.log('[直接API测试] 认证Cookie数量:', authCookies.length);
    
    // 创建Supabase客户端
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          get(name: string) {
            try {
              return cookieStore.get(name)?.value;
            } catch (e) {
              console.error('[直接API测试] Cookie获取错误:', e);
              return undefined;
            }
          },
          set(name: string, value: string, options?: CookieOptions) {
            try {
              // 添加明确的cookie选项以增强cookie稳定性
              const finalOptions = {
                ...options,
                // 确保cookie在整个域名下可用
                path: options?.path || "/",
                // 增加cookie持久性，默认为7天
                maxAge: options?.maxAge || 60 * 60 * 24 * 7,
                // 确保安全设置
                secure: process.env.NODE_ENV === "production",
                // 确保cookie可用于跨请求
                httpOnly: true,
                sameSite: "lax" as const
              };
              
              cookieStore.set(name, value, finalOptions);
            } catch (e) {
              console.warn('[直接API测试] Cookie设置错误:', e);
            }
          },
          remove(name: string, options?: CookieOptions) {
            try {
              cookieStore.set(name, "", { ...options, maxAge: 0 });
            } catch (e) {
              console.warn('[直接API测试] Cookie删除错误:', e);
            }
          }
        }
      }
    );
    
    // 获取当前用户
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      // 记录错误
      console.error('[直接API测试] 未授权:', error?.message || '无用户数据');
      
      // 返回401错误
      return NextResponse.json({
        success: false,
        error: '未授权访问，请先登录',
        authHeaderPresent: !!authHeader,
        cookiesPresent: authCookies.length > 0,
        serverMessage: '验证用户身份失败'
      }, { status: 401 });
    }
    
    // 成功，返回用户信息
    console.log('[直接API测试] 认证成功，用户:', user.id);
    
    return NextResponse.json({
      success: true,
      message: '认证成功',
      user: {
        id: user.id,
        email: user.email
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    // 记录错误
    console.error('[直接API测试] 处理请求出错:', error);
    
    // 返回500错误
    return NextResponse.json({
      success: false,
      error: '服务器内部错误',
      detail: error.message || String(error)
    }, { status: 500 });
  }
} 