import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    console.log('[UserInfo] 接收到用户信息请求');
    
    // 创建服务端Supabase客户端
    const supabase = await createClient();
    
    // 获取当前会话
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    // 如果有会话错误，尝试直接获取用户
    if (sessionError || !sessionData.session) {
      console.log('[UserInfo] 无会话或会话错误，尝试直接获取用户');
      
      const { data: userData, error: userError } = await supabase.auth.getUser();
      
      if (userError || !userData.user) {
        console.error('[UserInfo] 获取用户失败:', userError?.message || '未知错误');
        return NextResponse.json({
          success: false,
          message: '未找到有效用户'
        }, { status: 401 });
      }
      
      console.log('[UserInfo] 成功获取用户，用户ID:', userData.user.id);
      
      return NextResponse.json({
        success: true,
        user: {
          id: userData.user.id,
          email: userData.user.email,
          role: 'authenticated'
        }
      });
    }
    
    // 如果有会话，直接返回用户信息
    const user = sessionData.session.user;
    console.log('[UserInfo] 从会话获取用户，用户ID:', user.id);
    
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('[UserInfo] 处理用户信息请求时出错:', error);
    
    return NextResponse.json({
      success: false,
      message: '获取用户信息失败'
    }, { status: 500 });
  }
} 