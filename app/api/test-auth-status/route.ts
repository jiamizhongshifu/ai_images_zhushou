import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    console.log('[认证测试] 开始检查用户认证状态...');
    const supabase = await createClient();
    
    // 获取当前用户
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.error('[认证测试] 获取用户失败:', userError.message);
      return NextResponse.json({
        status: 'failed',
        authenticated: false,
        error: userError.message,
        message: '获取用户信息时出错',
      }, { status: 401 });
    }
    
    if (!user) {
      console.log('[认证测试] 未找到登录用户');
      return NextResponse.json({
        status: 'unauthenticated',
        authenticated: false,
        message: '未登录或会话已过期',
      });
    }
    
    console.log(`[认证测试] 找到已登录用户: ${user.id}`);
    
    // 获取用户详细信息
    const { data: userProfile, error: profileError } = await supabase
      .from('ai_images_creator_users')
      .select('*')
      .eq('user_id', user.id)
      .single();
      
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[认证测试] 获取用户档案失败:', profileError.message);
      
      // 用户已认证但无法获取详情
      return NextResponse.json({
        status: 'authenticated_no_profile',
        authenticated: true,
        userId: user.id,
        email: user.email,
        message: '已登录但无法获取用户详情',
        error: profileError.message
      });
    }
    
    // 获取用户点数
    const { data: credits, error: creditsError } = await supabase
      .from('ai_images_creator_credits')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (creditsError) {
      console.error('[认证测试] 获取用户点数失败:', creditsError.message);
    }
    
    return NextResponse.json({
      status: 'authenticated',
      authenticated: true,
      userId: user.id,
      email: user.email,
      userProfile: userProfile || null,
      credits: credits || null,
      message: '用户已登录',
    });
    
  } catch (error) {
    console.error('[认证测试] 检查认证状态时出错:', error);
    
    return NextResponse.json({
      status: 'error',
      authenticated: false,
      error: error instanceof Error ? error.message : String(error),
      message: '检查用户认证状态时发生错误',
    }, { status: 500 });
  }
} 