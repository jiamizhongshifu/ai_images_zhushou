import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 检查用户认证状态的API端点
 * 返回:
 * - authenticated: 布尔值，表示用户是否已认证
 * - userId: 字符串，用户ID（如果已认证）
 * - error: 错误信息（如果有）
 */
export async function GET(request: NextRequest) {
  try {
    // 获取服务器端supabase客户端
    const supabase = await createClient();
    
    // 获取当前会话
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[Auth Status API] 获取会话出错:', error);
      
      // 返回未认证状态
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
      console.log('[Auth Status API] 无有效会话');
      
      // 检查cookie是否有auth_valid标记
      const cookieStore = await cookies();
      const authValid = cookieStore.get('auth_valid');
      
      // 如果有auth_valid cookie但没有会话，可能是会话正在建立过程中
      if (authValid?.value === 'true') {
        const authTime = cookieStore.get('auth_time');
        const timeStr = authTime?.value || '0';
        const authTimeValue = parseInt(timeStr);
        const now = Date.now();
        const timeDiff = now - authTimeValue;
        
        // 如果cookie是在5分钟内设置的，可能是会话还在建立
        if (timeDiff < 5 * 60 * 1000) {
          console.log('[Auth Status API] 发现最近设置的认证cookie，可能正在等待会话建立');
          return NextResponse.json(
            { 
              authenticated: 'pending', 
              auth_time: authTimeValue,
              timestamp: now
            }, 
            { status: 202 }
          );
        }
      }
      
      // 返回未认证状态
      return NextResponse.json(
        { 
          authenticated: false,
          timestamp: Date.now()
        }, 
        { status: 401 }
      );
    }
    
    // 有效会话，设置auth_valid cookie
    const response = NextResponse.json(
      { 
        authenticated: true,
        user: {
          id: session.user.id,
          email: session.user.email,
        },
        timestamp: Date.now()
      }, 
      { status: 200 }
    );
    
    // 设置cookie以便客户端可以检测认证状态
    response.cookies.set('auth_valid', 'true', {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7天
      httpOnly: false, // 允许客户端JavaScript访问
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    
    response.cookies.set('auth_time', Date.now().toString(), {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7天
      httpOnly: false, // 允许客户端JavaScript访问
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    
    return response;
  } catch (error) {
    console.error('[Auth Status API] 验证会话时出错:', error);
    
    // 返回服务器错误
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