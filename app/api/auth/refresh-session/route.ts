import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    console.log('[RefreshSession] 接收到会话刷新请求');
    
    // 创建服务端Supabase客户端
    const supabase = await createClient();
    
    // 获取当前会话
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    // 记录当前会话状态
    console.log('[RefreshSession] 当前会话状态:', {
      hasSession: !!sessionData.session,
      error: sessionError?.message || null
    });
    
    // 如果已有会话，则直接返回成功
    if (sessionData.session) {
      console.log('[RefreshSession] 检测到有效会话，无需刷新');
      
      // 获取用户资料信息，确保Cookie中有足够的用户信息
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        console.log('[RefreshSession] 验证用户信息:', userData?.user?.id || '未获取到');
      } catch (userError) {
        console.warn('[RefreshSession] 获取用户信息失败:', userError);
      }
      
      const response = NextResponse.json({
        success: true,
        status: 'active',
        message: '会话有效，无需刷新',
        user: {
          id: sessionData.session.user.id,
          email: sessionData.session.user.email,
          role: sessionData.session.user.role
        }
      });
      
      // 确保设置认证cookie
      response.cookies.set('user_authenticated', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7天
        sameSite: 'lax'
      });
      
      // 设置认证时间
      response.cookies.set('auth_time', Date.now().toString(), {
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7天
        sameSite: 'lax'
      });
      
      // 清除任何存在的登出标记
      response.cookies.set('force_logged_out', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        sameSite: 'lax'
      });
      
      response.cookies.set('logged_out', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        sameSite: 'lax'
      });
      
      response.cookies.set('isLoggedOut', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        sameSite: 'lax'
      });
      
      return response;
    }
    
    // 如果没有会话，尝试刷新
    console.log('[RefreshSession] 未检测到有效会话，尝试刷新');
    
    // 尝试刷新会话
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError) {
      console.error('[RefreshSession] 刷新会话失败:', refreshError.message);
      
      // 检查是否有认证cookie，决定是否需要进一步恢复
      const hasAuthCookie = request.cookies.get('user_authenticated') !== undefined;
      
      if (hasAuthCookie) {
        console.log('[RefreshSession] 检测到认证cookie，尝试进一步恢复');
        
        // 尝试获取用户通过API
        try {
          // 尝试通过获取用户信息API恢复会话
          const { data: userData, error: userError } = await supabase.auth.getUser();
          
          if (userData && userData.user) {
            console.log('[RefreshSession] 成功获取用户信息，尝试再次刷新会话');
            
            // 再次尝试刷新会话
            const { data: secondRefreshData, error: secondRefreshError } = await supabase.auth.refreshSession();
            
            if (secondRefreshData.session) {
              console.log('[RefreshSession] 二次刷新会话成功');
              
              const response = NextResponse.json({
                success: true,
                status: 'recovered',
                message: '会话二次刷新成功',
                user: {
                  id: secondRefreshData.session.user.id,
                  email: secondRefreshData.session.user.email,
                  role: secondRefreshData.session.user.role
                }
              });
              
              // 设置认证cookie
              response.cookies.set('user_authenticated', 'true', {
                path: '/',
                maxAge: 60 * 60 * 24 * 7, // 7天
                sameSite: 'lax'
              });
              
              // 设置认证时间
              response.cookies.set('auth_time', Date.now().toString(), {
                path: '/',
                maxAge: 60 * 60 * 24 * 7, // 7天
                sameSite: 'lax'
              });
              
              return response;
            }
            
            console.log('[RefreshSession] 通过用户信息恢复会话状态');
            
            // 设置恢复响应
            const response = NextResponse.json({
              success: true,
              status: 'recovered',
              message: '通过用户信息恢复会话状态',
              user: userData.user
            });
            
            // 设置认证cookie
            response.cookies.set('user_authenticated', 'true', {
              path: '/',
              maxAge: 60 * 60 * 24 * 7, // 7天
              sameSite: 'lax'
            });
            
            // 设置认证时间
            response.cookies.set('auth_time', Date.now().toString(), {
              path: '/',
              maxAge: 60 * 60 * 24 * 7, // 7天
              sameSite: 'lax'
            });
            
            return response;
          }
        } catch (apiError) {
          console.error('[RefreshSession] 通过API获取用户信息失败:', apiError);
        }
      }
      
      // 如果所有恢复手段都失败，返回错误
      return NextResponse.json({
        success: false,
        status: 'error',
        message: '会话刷新失败',
        error: refreshError.message
      }, { status: 401 });
    }
    
    // 刷新成功
    if (refreshData.session) {
      console.log('[RefreshSession] 会话刷新成功');
      
      const response = NextResponse.json({
        success: true,
        status: 'refreshed',
        message: '会话刷新成功',
        user: {
          id: refreshData.session.user.id,
          email: refreshData.session.user.email,
          role: refreshData.session.user.role
        }
      });
      
      // 设置认证cookie
      response.cookies.set('user_authenticated', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7天
        sameSite: 'lax'
      });
      
      // 设置认证时间
      response.cookies.set('auth_time', Date.now().toString(), {
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7天
        sameSite: 'lax'
      });
      
      // 清除任何存在的登出标记
      response.cookies.set('force_logged_out', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        sameSite: 'lax'
      });
      
      response.cookies.set('logged_out', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        sameSite: 'lax'
      });
      
      response.cookies.set('isLoggedOut', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        sameSite: 'lax'
      });
      
      return response;
    }
    
    // 如果没有会话也没有错误，返回未认证状态
    return NextResponse.json({
      success: false,
      status: 'unauthenticated',
      message: '用户未认证'
    }, { status: 401 });
    
  } catch (error) {
    console.error('[RefreshSession] 处理会话刷新请求时出错:', error);
    
    return NextResponse.json({
      success: false,
      status: 'error',
      message: '处理会话刷新请求时出错'
    }, { status: 500 });
  }
} 