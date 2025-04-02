import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    
    // 验证用户是否已登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: '未授权访问' 
      }, { status: 401 });
    }
    
    // 获取用户正在进行中的任务（pending或processing状态）
    // 按创建时间倒序排列，最新的任务排在前面
    const { data: tasks, error } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(5); // 限制最多返回5个任务
    
    if (error) {
      console.error('获取进行中任务失败:', error);
      return NextResponse.json({ 
        success: false, 
        error: '获取进行中任务失败' 
      }, { status: 500 });
    }
    
    // 确保任务对象包含前端所需的字段
    const formattedTasks = tasks.map(task => {
      return {
        taskId: task.task_id, // 将数据库中的task_id映射为前端使用的taskId
        status: task.status,
        created_at: task.created_at,
        result_url: task.result_url,
        error_message: task.error_message,
        // 其他可能需要的字段
        prompt: task.prompt,
        processing_started_at: task.processing_started_at,
        completed_at: task.completed_at
      };
    });
    
    return NextResponse.json({
      success: true,
      tasks: formattedTasks
    });
  } catch (error) {
    console.error('获取进行中任务异常:', error);
    return NextResponse.json({ 
      success: false, 
      error: '获取进行中任务时发生错误' 
    }, { status: 500 });
  }
} 