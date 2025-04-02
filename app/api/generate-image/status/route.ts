import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

/**
 * 查询图像生成任务状态API
 * 
 * 查询参数:
 * - taskId: 任务ID (必需)
 * 
 * 响应:
 * {
 *   success: boolean,
 *   task: {
 *     status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled',
 *     prompt: string,
 *     style: string,
 *     result_url: string, // 仅当状态为completed时
 *     created_at: string,
 *     updated_at: string,
 *     completed_at: string, // 仅当状态为completed时
 *     error_message: string, // 仅当状态为failed时
 *   },
 *   error?: string
 * }
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    
    // 验证任务ID参数
    if (!taskId) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少任务ID参数' 
      }, { status: 400 });
    }
    
    const supabase = await createClient();
    
    // 验证用户是否已登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: '未授权访问' 
      }, { status: 401 });
    }
    
    // 查询任务状态
    const { data: task, error } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      // 检查是否是任务不存在的情况
      if (error.code === 'PGRST116') {
        return NextResponse.json({ 
          success: false, 
          error: '任务不存在' 
        }, { status: 404 });
      }
      
      console.error('查询任务状态失败:', error);
      return NextResponse.json({ 
        success: false, 
        error: '查询任务状态失败' 
      }, { status: 500 });
    }
    
    // 格式化任务数据，确保字段名与前端期望一致
    const formattedTask = {
      taskId: task.task_id,
      status: task.status,
      result_url: task.result_url,
      error_message: task.error_message,
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_at: task.completed_at,
      prompt: task.prompt
    };
    
    return NextResponse.json({
      success: true,
      task: formattedTask
    });
  } catch (error) {
    console.error('获取任务状态异常:', error);
    return NextResponse.json({ 
      success: false, 
      error: '获取任务状态时发生错误' 
    }, { status: 500 });
  }
} 