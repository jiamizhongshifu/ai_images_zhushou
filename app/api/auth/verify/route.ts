import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient();

    // 获取会话
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('[验证API] 获取会话失败:', sessionError?.message);
      return new NextResponse(JSON.stringify({ 
        error: '无效会话',
        details: sessionError?.message 
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 获取用户信息
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[验证API] 获取用户信息失败:', userError?.message);
      return new NextResponse(JSON.stringify({ 
        error: '无效用户',
        details: userError?.message 
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 检查必要的cookie是否存在
    const accessTokenCookie = cookieStore.get('sb-access-token');
    const authTokenCookie = cookieStore.get('supabase-auth-token');
    
    if (!accessTokenCookie && !authTokenCookie) {
      console.error('[验证API] 缺少认证Cookie');
      return new NextResponse(JSON.stringify({ 
        error: '缺少认证Cookie'
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 返回成功响应
    return new NextResponse(JSON.stringify({
      authenticated: true,
      userId: user.id,
      email: user.email
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[验证API] 验证过程出错:', error);
    return new NextResponse(JSON.stringify({ 
      error: '验证过程出错',
      details: error instanceof Error ? error.message : '未知错误'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 