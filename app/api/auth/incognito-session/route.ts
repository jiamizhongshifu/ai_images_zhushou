/**
 * 无痕模式会话管理API
 * 用于在无痕模式或浏览器扩展环境下维持会话状态
 */

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

/**
 * 专用于无痕模式或浏览器扩展环境下的会话验证API
 * 这个API将验证服务器端的会话状态，并返回用户信息
 */
export async function GET(request: Request) {
  try {
    // 创建服务器端Supabase客户端
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    // 获取会话状态
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('incognito-session API - 获取会话时出错:', error);
      return NextResponse.json({ 
        status: 'error', 
        message: '获取会话时出错',
        error: error.message 
      }, { status: 500 });
    }

    if (!session) {
      // 测试使用cookie中的临时标识来验证会话
      const authCookie = cookieStore.get('user_authenticated');
      const sessionVerifiedCookie = cookieStore.get('session_verified');
      
      // 如果有认证cookie但没有会话，可能是会话获取失败但用户实际已登录
      if (authCookie?.value === 'true' && sessionVerifiedCookie?.value === 'true') {
        console.log('incognito-session API - 未找到会话但存在认证Cookie，尝试创建临时会话');
        
        // 设置会话cookie
        const cookieStore2 = await cookies();
        cookieStore2.set({
          name: 'user_authenticated',
          value: 'true',
          path: '/',
          maxAge: 3600,
          sameSite: 'lax'
        });
        
        cookieStore2.set({
          name: 'session_verified',
          value: 'true',
          path: '/',
          maxAge: 3600,
          sameSite: 'lax'
        });
        
        // 返回临时认证成功响应
        return NextResponse.json({
          status: 'success',
          message: '基于Cookie的临时会话验证成功',
          isTemporarySession: true,
          lastVerified: new Date().toISOString()
        });
      }
      
      console.log('incognito-session API - 未找到有效会话');
      return NextResponse.json({ 
        status: 'error', 
        message: '未找到有效会话' 
      }, { status: 401 });
    }

    // 会话有效，返回用户信息
    console.log('incognito-session API - 找到有效会话，用户ID:', session.user.id);
    
    // 设置会话cookie以便客户端可以识别
    const cookieStore2 = await cookies();
    cookieStore2.set({
      name: 'user_authenticated',
      value: 'true',
      path: '/',
      maxAge: 3600,
      sameSite: 'lax'
    });
    
    cookieStore2.set({
      name: 'session_verified',
      value: 'true',
      path: '/',
      maxAge: 3600,
      sameSite: 'lax'
    });

    return NextResponse.json({
      status: 'success',
      message: '会话验证成功',
      userId: session.user.id,
      email: session.user.email,
      lastVerified: new Date().toISOString()
    });
  } catch (err) {
    console.error('incognito-session API - 处理请求时出现异常:', err);
    
    // 出错时尝试从cookie恢复
    try {
      const cookieStore = await cookies();
      const authCookie = cookieStore.get('user_authenticated');
      const sessionVerifiedCookie = cookieStore.get('session_verified');
      
      if (authCookie?.value === 'true' && sessionVerifiedCookie?.value === 'true') {
        console.log('incognito-session API - 请求出错但Cookie有效，返回临时会话');
        return NextResponse.json({
          status: 'success',
          message: '基于Cookie的紧急会话恢复',
          isTemporarySession: true,
          lastVerified: new Date().toISOString()
        });
      }
    } catch (cookieError) {
      console.error('incognito-session API - 尝试恢复Cookie也失败:', cookieError);
    }
    
    return NextResponse.json({ 
      status: 'error', 
      message: '处理请求时出现异常' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 获取请求体
    const body = await request.json();
    const { sessionData } = body;
    
    if (!sessionData || !sessionData.access_token) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: '会话数据无效',
          timestamp: Date.now()
        },
        { status: 400 }
      );
    }
    
    // 创建带有会话数据的响应
    const response = NextResponse.json(
      { 
        status: 'success', 
        message: '会话已保存',
        timestamp: Date.now()
      },
      { status: 200 }
    );
    
    // 设置会话cookie（使用一个通用的标记）
    response.cookies.set('incognito_session', 'active', { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600, // 1小时有效期
      path: '/',
      sameSite: 'lax'
    });
    
    response.cookies.set('user_authenticated', 'true', { 
      maxAge: 3600, // 1小时有效期
      path: '/',
      sameSite: 'lax'
    });
    
    response.cookies.set('session_verified', 'true', { 
      maxAge: 3600, // 1小时有效期
      path: '/',
      sameSite: 'lax'
    });
    
    // 清除任何登出标记
    response.cookies.set('force_logged_out', '', { 
      maxAge: 0,
      path: '/',
    });
    
    response.cookies.set('isLoggedOut', '', { 
      maxAge: 0,
      path: '/',
    });
    
    response.cookies.set('logged_out', '', { 
      maxAge: 0,
      path: '/',
    });
    
    return response;
  } catch (error) {
    console.error('[API] 无痕模式会话保存API错误:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: '服务器内部错误',
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
} 