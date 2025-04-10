import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  console.log('[API] 处理用户登出请求');
  
  let success = true;
  let error = null;
  
  try {
    // 1. 创建服务端Supabase客户端
    const supabase = await createClient();
    
    // 2. 首先获取当前会话信息（用于日志记录）
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    
    if (userId) {
      console.log(`[API] 准备登出用户ID: ${userId}`);
    } else {
      console.log('[API] 无活动会话，可能已登出');
    }
    
    // 3. 执行Supabase登出
    const { error: signOutError } = await supabase.auth.signOut({
      scope: 'global' // 在所有设备上登出
    });
    
    if (signOutError) {
      console.error('[API] Supabase登出错误:', signOutError);
      success = false;
      error = signOutError.message;
    } else {
      console.log('[API] 用户登出成功');
    }
    
    // 4. 验证登出是否成功 - 二次检查
    const { data: { session: checkSession } } = await supabase.auth.getSession();
    if (checkSession) {
      console.warn('[API] 警告：登出后仍检测到会话，将尝试二次登出');
      // 尝试再次登出
      await supabase.auth.signOut({ scope: 'global' });
    }
    
    // 5. 创建响应对象
    const response = NextResponse.json(
      { success, error },
      { 
        status: success ? 200 : 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        }
      }
    );
    
    // 6. 明确在响应中删除所有认证相关的cookie
    // Supabase相关
    response.cookies.delete('sb-access-token');
    response.cookies.delete('sb-refresh-token');
    response.cookies.delete('supabase-auth-token');
    response.cookies.delete('sb-session-recovery');
    response.cookies.delete('sb-auth-token');
    response.cookies.delete('__session');
    
    // 自定义认证相关
    response.cookies.delete('access_token');
    response.cookies.delete('refresh_token');
    response.cookies.delete('auth_token');
    response.cookies.delete('user_authenticated');
    response.cookies.delete('force_login');
    response.cookies.delete('session_verified');
    
    // 7. 设置用于指示登出状态的cookie标记
    response.cookies.set('logged_out', 'true', {
      path: '/',
      maxAge: 60 * 5, // 5分钟
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
    });
    
    // 设置指示用户需要重新登录的cookie
    response.cookies.set('auth_logged_out', 'true', {
      path: '/',
      maxAge: 60 * 60, // 1小时
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
    });
    
    // 设置强制登出标记（长期有效）
    response.cookies.set('force_logged_out', 'true', {
      path: '/',
      maxAge: 60 * 60 * 24, // 24小时
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
    });
    
    // 设置登出时间戳 - 用于多层级验证
    response.cookies.set('logout_timestamp', Date.now().toString(), {
      path: '/',
      maxAge: 60 * 60 * 24, // 24小时
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
    });
    
    // 8. 同时设置一些安全相关的头信息
    response.headers.set('Clear-Site-Data', '"cookies", "storage"');
    
    return response;
    
  } catch (err: any) {
    console.error('[API] 登出过程中出错:', err);
    success = false;
    error = err.message || '登出过程中出现未知错误';
    
    // 即使出错也尝试设置登出标记
    const response = NextResponse.json(
      { success, error },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        }
      }
    );
    
    // 设置登出标记
    response.cookies.set('force_logged_out', 'true', {
      path: '/',
      maxAge: 60 * 60 * 24, // 24小时
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
    });
    
    response.cookies.set('logged_out', 'true', {
      path: '/',
      maxAge: 60 * 5, // 5分钟
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
    });
    
    return response;
  }
}

// 允许浏览器直接访问登出路由
export async function GET(request: NextRequest) {
  return POST(request);
}