import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // 创建Supabase客户端
    const supabase = await createClient();
    
    // 尝试刷新会话
    const { data, error } = await supabase.auth.getSession();
    
    // 记录会话状态
    console.log('[AuthRefresh] 会话状态:', {
      hasSession: !!data.session,
      error: error?.message || null
    });
    
    // 如果没有会话但有认证cookie，尝试恢复会话
    const cookieStore = await cookies();
    const hasAuthCookie = cookieStore.has('user_authenticated');
    const hasSessionCookie = cookieStore.has('sb-access-token') || 
                            cookieStore.has('sb-refresh-token');
    
    if (!data.session && (hasAuthCookie || hasSessionCookie)) {
      console.log('[AuthRefresh] 检测到认证cookie但无会话，尝试恢复会话');
      
      // 设置会话恢复标记
      const response = NextResponse.json({ 
        success: true, 
        status: 'recovery',
        message: '已设置会话恢复标记'
      });
      
      // 设置会话恢复cookie
      response.cookies.set('auth_recovery', 'true', {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 30, // 30分钟
        sameSite: 'lax'
      });
      
      return response;
    }
    
    // 如果有会话，确保设置认证cookie
    if (data.session) {
      console.log('[AuthRefresh] 会话有效，设置认证cookie');
      
      const response = NextResponse.json({ 
        success: true, 
        status: 'authenticated',
        user: {
          id: data.session.user.id,
          email: data.session.user.email
        },
        session: {
          expires_at: data.session.expires_at
        }
      });
      
      // 设置认证cookie
      response.cookies.set('user_authenticated', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24, // 24小时
        sameSite: 'lax'
      });
      
      return response;
    }
    
    // 如果没有会话也没有认证cookie，返回未认证状态
    return NextResponse.json({ 
      success: false, 
      status: 'unauthenticated',
      message: '用户未认证'
    });
    
  } catch (error) {
    console.error('[AuthRefresh] 刷新会话时出错:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: '刷新会话失败'
    }, { status: 500 });
  }
} 