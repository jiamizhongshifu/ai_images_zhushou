import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    console.log('[auth-test] 开始测试认证状态...');
    
    // 获取supabase客户端
    const supabase = await createClient();
    
    // 获取cookies
    const cookies = request.headers.get('cookie') || '';
    console.log(`[auth-test] Cookies: ${cookies}`);
    
    // 获取会话
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[auth-test] 获取会话失败:', error.message);
      return NextResponse.json({
        status: 'error',
        message: '获取会话失败',
        error: error.message
      }, { status: 500 });
    }
    
    if (!session) {
      console.log('[auth-test] 未找到会话');
      return NextResponse.json({
        status: 'unauthenticated',
        message: '用户未登录'
      });
    }
    
    // 获取用户
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('[auth-test] 获取用户失败:', userError?.message || '未找到用户');
      return NextResponse.json({
        status: 'error',
        message: '获取用户失败',
        sessionExists: true,
        sessionExpiration: session.expires_at,
        error: userError?.message || '未找到用户'
      }, { status: 500 });
    }
    
    // 获取用户点数
    const { data: credits, error: creditsError } = await supabase
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', user.id)
      .single();
      
    if (creditsError && creditsError.code !== 'PGRST116') {
      console.error('[auth-test] 获取用户点数失败:', creditsError.message);
    }
    
    // 返回认证信息
    return NextResponse.json({
      status: 'authenticated',
      message: '用户已登录',
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone
      },
      credits: credits?.credits || null,
      session: {
        expiresAt: session?.expires_at,
        hasAccess: session?.expires_at ? session.expires_at * 1000 > Date.now() : false
      }
    });
    
  } catch (error) {
    console.error('[auth-test] 测试认证状态失败:', error);
    
    return NextResponse.json({
      status: 'error',
      message: '测试认证状态失败',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 