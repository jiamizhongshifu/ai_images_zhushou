import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

// 处理GET请求
export async function GET(request: NextRequest) {
  // 获取taskId参数
  const searchParams = request.nextUrl.searchParams;
  const taskId = searchParams.get('taskId');
  
  // 如果没有提供taskId，返回错误
  if (!taskId) {
    return NextResponse.json({ 
      success: false, 
      error: '未提供任务ID' 
    }, { status: 400 });
  }
  
  try {
    // 创建用户级别的客户端（有权限检查）
    const supabase = await createClient();
    
    // 获取当前用户信息
    const { data: userData } = await supabase.auth.getUser();
    
    if (!userData?.user) {
      return NextResponse.json({ 
        success: false, 
        error: '未授权访问' 
      }, { status: 401 });
    }
    
    // 首先尝试使用用户权限查询
    let { data, error } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('taskId', taskId)
      .eq('user_id', userData.user.id)
      .single();
    
    // 如果有错误但不是"没有找到记录"，返回错误
    if (error && error.code !== 'PGRST116') {
      console.error(`查询任务状态失败:`, error);
      return NextResponse.json({ 
        success: false, 
        error: `查询任务状态失败: ${error.message}` 
      }, { status: 500 });
    }
    
    // 如果找到了记录，返回任务状态
    if (data) {
      return NextResponse.json({ 
        success: true, 
        task: data 
      });
    }
    
    // 用户级别查询没有找到记录，尝试使用管理员权限查询
    // 这对于调试和管理员访问很有用
    try {
      const adminClient = createAdminClient();
      
      const { data: adminData, error: adminError } = await adminClient
        .from('ai_images_creator_tasks')
        .select('*')
        .eq('taskId', taskId)
        .single();
      
      if (adminError) {
        throw adminError;
      }
      
      if (adminData) {
        // 检查是否是同一用户的任务
        if (adminData.user_id === userData.user.id) {
          return NextResponse.json({ 
            success: true, 
            task: adminData 
          });
        } else {
          // 不是同一用户的任务，返回权限错误
          return NextResponse.json({ 
            success: false, 
            error: '您没有权限查看此任务' 
          }, { status: 403 });
        }
      }
    } catch (adminQueryError) {
      console.error('管理员查询任务失败:', adminQueryError);
      // 不向客户端暴露admin查询错误，继续尝试其他方法
    }
    
    // 如果数据库中都找不到，尝试从通知API获取取消状态
    try {
      const notifyUrl = new URL('/api/generate-image/notify-cancel', request.url);
      notifyUrl.searchParams.set('taskId', taskId);
      notifyUrl.searchParams.set('checkOnly', 'true');
      
      const notifyResponse = await fetch(notifyUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (notifyResponse.ok) {
        const notifyData = await notifyResponse.json();
        
        if (notifyData.isCancelled) {
          // 从通知API中获取到了取消状态
          return NextResponse.json({
            success: true,
            task: {
              taskId: taskId,
              status: 'cancelled',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              user_id: userData.user.id,
              // 可能没有其他数据，但至少有状态信息
            }
          });
        }
      }
    } catch (notifyError) {
      console.error('获取取消通知状态失败:', notifyError);
      // 通知API查询失败，但不影响主流程
    }
    
    // 所有方法都找不到任务，返回404
    return NextResponse.json({ 
      success: false, 
      error: '任务不存在或已被删除' 
    }, { status: 404 });
    
  } catch (error) {
    console.error('查询任务状态时发生错误:', error);
    return NextResponse.json({ 
      success: false, 
      error: '查询任务状态时发生错误' 
    }, { status: 500 });
  }
} 