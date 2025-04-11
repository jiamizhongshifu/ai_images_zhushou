import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    console.log('[强制登录] 开始处理强制登录请求...');
    
    // 解析请求体
    const body = await request.json().catch((error) => {
      console.error('解析请求JSON失败:', error);
      throw new Error('无效的请求格式，无法解析JSON数据');
    });
    
    const { email } = body;
    
    if (!email) {
      return NextResponse.json({
        status: 'failed',
        error: '缺少必要参数: email',
      }, { status: 400 });
    }
    
    // 使用管理员客户端查询用户
    const supabaseAdmin = await createAdminClient();
    
    try {
      // 直接从Auth API获取用户列表
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({});
      
      if (authError) {
        console.error(`[强制登录] 查询用户失败:`, authError);
        return NextResponse.json({
          status: 'failed',
          error: '查询用户失败',
          details: authError.message
        }, { status: 500 });
      }
      
      // 在用户列表中查找匹配的邮箱
      const user = authData?.users?.find(u => u.email === email);
      
      if (!user) {
        console.error(`[强制登录] 未找到用户: ${email}`);
        return NextResponse.json({
          status: 'failed',
          error: '未找到用户',
        }, { status: 404 });
      }
      
      const userId = user.id;
      
      // 创建用户会话 - 使用supabase admin API
      const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: email,
      });
      
      if (sessionError) {
        console.error(`[强制登录] 创建会话失败:`, sessionError);
        return NextResponse.json({
          status: 'failed',
          error: '创建会话失败',
          details: sessionError.message
        }, { status: 500 });
      }
      
      console.log(`[强制登录] 已为用户 ${userId} 生成登录链接`);
      
      // 获取令牌并直接创建会话
      const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.signInWithPassword({
        email: email,
        password: process.env.ADMIN_DEFAULT_PASSWORD || 'Temporary2024!'
      });
      
      if (tokenError) {
        console.error(`[强制登录] 使用密码登录失败:`, tokenError);
        return NextResponse.json({
          status: 'partial_success',
          message: '创建了魔法链接，但无法生成会话令牌',
          email: email,
          magicLink: sessionData.properties.action_link
        });
      }
      
      // 返回会话信息
      return NextResponse.json({
        status: 'success',
        message: '成功创建会话',
        userId: userId,
        email: email,
        magicLink: sessionData.properties.action_link,
        session: tokenData.session
      });
    
    } catch (error) {
      console.error(`[强制登录] 处理错误:`, error);
      return NextResponse.json({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error(`[强制登录] 处理强制登录请求失败:`, error);
    
    return NextResponse.json({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
} 