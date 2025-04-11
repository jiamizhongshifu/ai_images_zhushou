import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

// @ts-nocheck - 暂时忽略类型检查以快速修复功能
export async function GET(req: Request) {
  try {
    // 检查认证头部，支持系统任务处理器直接访问
    const authHeader = req.headers.get('authorization');
    const silentMode = req.headers.get('x-silent-mode') === 'true';
    let isSystemAccess = false;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const validSecretKey = process.env.TASK_PROCESS_SECRET_KEY || '';
      
      // 如果是系统秘钥，直接使用admin客户端查询所有任务
      if (token === validSecretKey) {
        isSystemAccess = true;
        // 只有在非静默模式下才输出日志
        if (!silentMode) {
          console.log('系统任务处理器访问已授权');
        }
        
        // 使用管理员客户端查询所有待处理任务
        const supabase = await createAdminClient();
        const { data: pendingTasks, error } = await supabase
          .from('image_tasks')
          .select('*')
          .in('status', ['pending', 'processing'])
          .order('created_at', { ascending: true })
          .limit(10); // 限制查询结果数量
        
        if (error) {
          console.error('查询所有待处理任务失败:', error);
          return NextResponse.json({ 
            success: false,
            error: "查询失败", 
            message: error.message 
          }, { status: 500 });
        }
        
        // 确保任务对象包含处理器所需的字段
        const formattedTasks = pendingTasks.map(task => ({
          taskId: task.task_id,
          status: task.status,
          created_at: task.created_at,
          result_url: task.result_url,
          error_message: task.error_message,
          prompt: task.prompt,
          processing_started_at: task.processing_started_at,
          completed_at: task.completed_at,
          image_base64: task.image_base64 // 包含图片数据
        }));
        
        return NextResponse.json({
          success: true,
          tasks: formattedTasks
        });
      }
    }
    
    // 如果不是系统访问，则检查用户认证
    // 创建Supabase客户端 - 需要await
    const supabase = await createClient();
    
    // 获取当前登录用户
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "未授权访问",
          message: "无法验证您的身份，请重新登录",
        },
        { status: 401 }
      );
    }
    
    // 查询该用户的待处理任务
    const { data: pendingTasks, error } = await supabase
      .from('image_tasks')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('查询待处理任务失败:', error);
      return NextResponse.json({ 
        success: false,
        error: "查询失败", 
        message: error.message 
      }, { status: 500 });
    }
    
    // 检测是否有卡住的任务（超过30分钟的pending或processing任务）
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const stuckTasks = pendingTasks.filter(task => 
      new Date(task.created_at) < new Date(thirtyMinutesAgo)
    );
    
    // 自动取消卡住的任务
    if (stuckTasks.length > 0) {
      console.log(`发现${stuckTasks.length}个卡住的任务，准备自动取消`);
      
      for (const task of stuckTasks) {
        console.log(`自动取消超时任务: ${task.task_id}`);
        
        // 使用RPC函数cancel_task替代直接更新
        const { data: cancelResult, error: updateError } = await supabase
          .rpc('cancel_task', { 
            task_id_param: task.task_id, 
            user_id_param: user.id 
          });
          
        if (updateError) {
          console.error(`自动取消任务${task.task_id}失败:`, updateError);
          
          // 如果RPC调用失败，尝试直接更新（降级方案）
          console.log(`尝试降级方案：直接更新任务状态...`);
          const { error: directUpdateError } = await supabase
            .from('image_tasks')
            .update({ 
              status: 'cancelled',
              updated_at: new Date().toISOString(),
              error_message: '系统自动取消 - 任务超过30分钟未完成'
            })
            .eq('task_id', task.task_id)
            .eq('user_id', user.id); // 明确指定用户ID很重要
            
          if (directUpdateError) {
            console.error(`直接更新任务状态也失败:`, directUpdateError);
          } else {
            console.log(`通过直接更新成功取消任务: ${task.task_id}`);
          }
        } else {
          console.log(`通过RPC函数成功取消任务: ${task.task_id}, 结果:`, cancelResult);
        }
      }
      
      // 重新获取更新后的任务列表
      const { data: updatedTasks, error: refetchError } = await supabase
        .from('image_tasks')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });
        
      if (!refetchError && updatedTasks) {
        // 确保任务对象包含前端所需的字段
        const formattedTasks = updatedTasks.map(task => ({
          taskId: task.task_id,
          status: task.status,
          created_at: task.created_at,
          result_url: task.result_url,
          error_message: task.error_message,
          prompt: task.prompt,
          processing_started_at: task.processing_started_at,
          completed_at: task.completed_at
        }));
        
        return NextResponse.json({
          success: true,
          tasks: formattedTasks
        });
      }
    }
    
    // 确保任务对象包含前端所需的字段
    const formattedTasks = pendingTasks.map(task => ({
      taskId: task.task_id,
      status: task.status,
      created_at: task.created_at,
      result_url: task.result_url,
      error_message: task.error_message,
      prompt: task.prompt,
      processing_started_at: task.processing_started_at,
      completed_at: task.completed_at
    }));
    
    return NextResponse.json({
      success: true,
      tasks: formattedTasks
    });
  } catch (error) {
    console.error('获取待处理任务时出错:', error);
    return NextResponse.json(
      { 
        success: false,
        error: "服务器错误", 
        message: error instanceof Error ? error.message : "未知错误" 
      }, 
      { status: 500 }
    );
  }
} 