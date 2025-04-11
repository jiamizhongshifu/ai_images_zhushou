import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    console.log('[登录] 开始处理登录请求...');
    
    // 解析请求体
    const body = await request.json().catch((error) => {
      console.error('解析请求JSON失败:', error);
      throw new Error('无效的请求格式，无法解析JSON数据');
    });
    
    const { email, password } = body;
    
    if (!email || !password) {
      return NextResponse.json({
        status: 'failed',
        error: '邮箱和密码不能为空'
      }, { status: 400 });
    }
    
    // 获取supabase客户端
    const supabase = await createClient();
    
    // 使用用户凭据登录
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.error('[登录] 登录失败:', error.message);
      
      // 如果是密码错误，尝试使用管理员客户端创建会话
      if (error.message.includes('Invalid login credentials')) {
        try {
          console.log('[登录] 密码错误，尝试使用管理员API创建会话');
          
          // 获取管理员客户端
          const adminClient = await createAdminClient();
          
          // 获取用户ID
          const { data: users, error: listError } = await adminClient.auth.admin.listUsers({});
          
          if (listError) {
            console.error('[登录] 获取用户列表失败:', listError.message);
            throw new Error('获取用户列表失败');
          }
          
          // 查找匹配的用户
          const user = users.users.find(u => u.email === email);
          
          if (!user) {
            return NextResponse.json({
              status: 'failed',
              error: '用户不存在'
            }, { status: 404 });
          }
          
          // 使用管理员API创建会话链接
          const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
            type: 'magiclink',
            email: email
          });
          
          if (linkError) {
            console.error('[登录] 生成登录链接失败:', linkError.message);
            throw new Error('生成登录链接失败');
          }
          
          console.log('[登录] 成功生成登录链接');
          
          return NextResponse.json({
            status: 'partial_success',
            message: '已生成登录链接，请检查邮箱',
            magicLink: linkData.properties.action_link
          });
        } catch (adminError) {
          console.error('[登录] 管理员API操作失败:', adminError);
          
          return NextResponse.json({
            status: 'failed',
            error: '登录失败',
            details: error.message
          }, { status: 401 });
        }
      }
      
      return NextResponse.json({
        status: 'failed',
        error: '登录失败',
        details: error.message
      }, { status: 401 });
    }
    
    if (!data.session) {
      return NextResponse.json({
        status: 'failed',
        error: '登录成功但未返回会话',
      }, { status: 500 });
    }
    
    console.log('[登录] 用户登录成功:', email);
    
    // 返回会话信息
    return NextResponse.json({
      status: 'success',
      message: '登录成功',
      session: {
        access_token: data.session.access_token,
        expires_at: data.session.expires_at,
        refresh_token: data.session.refresh_token,
        user: {
          id: data.user.id,
          email: data.user.email
        }
      }
    });
    
  } catch (error) {
    console.error('[登录] 处理登录请求失败:', error);
    
    return NextResponse.json({
      status: 'failed',
      error: '登录处理失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 