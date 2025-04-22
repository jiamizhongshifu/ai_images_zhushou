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
  const cookieStore = await cookies();
  const authValid = cookieStore.get('auth_valid');
  
  if (!authValid) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
  }
  
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
  }
  
  // 创建匿名会话
  const response = NextResponse.json({
    status: 'success',
    session: {
      userId: user.id,
      email: user.email,
      created: new Date().toISOString()
    }
  });
  
  // 设置会话cookie
  response.cookies.set('incognito_session', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 // 1小时
  });
  
  return response;
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