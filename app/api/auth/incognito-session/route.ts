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
export async function GET(request: NextRequest) {
  try {
    // 获取服务器端supabase客户端
    const supabase = await createClient();
    
    // 获取当前会话
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[Incognito Session API] 获取会话出错:', error);
      return NextResponse.json(
        { 
          authenticated: false, 
          error: error.message,
          timestamp: Date.now()
        }, 
        { status: 401 }
      );
    }
    
    // 检查会话是否存在
    if (!session) {
      console.log('[Incognito Session API] 无有效会话');
      
      // 检查cookie中是否有auth_valid标记
      const cookieStore = cookies();
      const authValid = cookieStore.get('auth_valid');
      
      if (authValid?.value === 'true') {
        console.log('[Incognito Session API] 从cookie检测到认证标记，但无法找到会话');
        return NextResponse.json(
          { 
            authenticated: 'cookie_only',
            message: '检测到cookie认证标记，但无有效会话',
            timestamp: Date.now()
          }, 
          { status: 202 }
        );
      }
      
      return NextResponse.json(
        { 
          authenticated: false,
          message: '未找到有效会话',
          timestamp: Date.now()
        }, 
        { status: 401 }
      );
    }
    
    // 有效会话，返回会话信息并设置cookie
    const response = NextResponse.json(
      { 
        authenticated: true,
        user: {
          id: session.user.id,
          email: session.user.email
        },
        timestamp: Date.now()
      }, 
      { status: 200 }
    );
    
    // 设置cookie以便在无法访问存储的环境下识别登录状态
    response.cookies.set('storage_limitation', 'true', {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7天
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    
    response.cookies.set('auth_valid', 'true', {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7天
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    
    response.cookies.set('auth_time', Date.now().toString(), {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7天
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    
    return response;
  } catch (error) {
    console.error('[Incognito Session API] 验证会话时出错:', error);
    return NextResponse.json(
      { 
        authenticated: false, 
        error: error instanceof Error ? error.message : '未知错误',
        timestamp: Date.now()
      }, 
      { status: 500 }
    );
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