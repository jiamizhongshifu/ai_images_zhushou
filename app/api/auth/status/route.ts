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
    const cookieStore = await cookies();
    const authValid = cookieStore.get('auth_valid');
    const sessionRecovery = cookieStore.get('session_recovery');
    
    // 如果没有认证标记，直接返回未认证状态
    if (!authValid) {
      return NextResponse.json({ 
        authenticated: false,
        message: '未找到认证标记',
        timestamp: Date.now()
      }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    // 如果有错误但存在会话恢复数据，尝试恢复会话
    if ((error || !session) && sessionRecovery) {
      try {
        const recoveryData = JSON.parse(sessionRecovery.value);
        const { data: { session: recoveredSession }, error: refreshError } = 
          await supabase.auth.refreshSession({
            refresh_token: recoveryData.refresh_token
          });

        if (refreshError) throw refreshError;
        
        if (recoveredSession) {
          return NextResponse.json({
            authenticated: true,
            user: {
              id: recoveredSession.user.id,
              email: recoveredSession.user.email
            },
            recovered: true,
            timestamp: Date.now()
          });
        }
      } catch (recoveryError) {
        console.error('[Auth Status] 会话恢复失败:', recoveryError);
      }
    }

    // 如果没有会话且恢复失败，返回未认证状态
    if (!session) {
      return NextResponse.json({
        authenticated: false,
        message: '无有效会话',
        timestamp: Date.now()
      }, { status: 401 });
    }

    // 返回认证成功状态
    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email
      },
      timestamp: Date.now()
    });

    // 更新认证cookie
    response.cookies.set('auth_valid', 'true', {
      path: '/',
      maxAge: 3600,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    response.cookies.set('auth_time', Date.now().toString(), {
      path: '/',
      maxAge: 3600,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    return response;
  } catch (error) {
    console.error('[Auth Status] 验证会话时出错:', error);
    return NextResponse.json({
      authenticated: false,
      error: error instanceof Error ? error.message : '未知错误',
      timestamp: Date.now()
    }, { status: 500 });
  }
} 