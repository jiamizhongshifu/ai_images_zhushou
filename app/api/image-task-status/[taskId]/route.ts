import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  try {
    // 获取任务ID - 注意Next.js 15需要await params
    const params = await context.params;
    const { taskId } = params;
    
    console.log(`[TaskStatus API] 获取任务状态: ${taskId}`);
    
    if (!taskId) {
      console.log('[TaskStatus API] 缺少任务ID');
      return NextResponse.json(
        { error: '缺少任务ID' },
        { status: 400 }
      );
    }
    
    // 获取用户信息
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('[TaskStatus API] 用户未认证');
      return NextResponse.json(
        { error: '未授权访问' },
        { status: 401 }
      );
    }
    
    console.log(`[TaskStatus API] 用户已认证: ${user.id}, 查询任务: ${taskId}`);
    
    // 查询任务状态
    const { data, error } = await supabase
      .from('image_tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      console.error(`[TaskStatus API] 查询任务状态失败: ${error.message}`);
      return NextResponse.json(
        { error: '查询任务状态失败', details: error.message },
        { status: 500 }
      );
    }
    
    if (!data) {
      console.log(`[TaskStatus API] 任务不存在或无权访问: ${taskId}`);
      return NextResponse.json(
        { error: '任务不存在或无权访问' },
        { status: 404 }
      );
    }
    
    // 根据任务状态返回不同的响应
    switch (data.status) {
      case 'completed':
        console.log(`[TaskStatus API] 任务已完成: ${taskId}`);
        return NextResponse.json({
          taskId: data.id,
          status: 'completed',
          imageUrl: data.image_url,
          prompt: data.prompt,
          style: data.style,
          completedAt: data.completed_at
        });
        
      case 'failed':
        console.log(`[TaskStatus API] 任务失败: ${taskId}, 错误: ${data.error_message}`);
        return NextResponse.json({
          taskId: data.id,
          status: 'failed',
          error: data.error_message,
          prompt: data.prompt,
          style: data.style
        });
        
      case 'pending':
      case 'processing':
      default:
        const waitTime = Math.floor((Date.now() - new Date(data.created_at).getTime()) / 1000);
        console.log(`[TaskStatus API] 任务处理中: ${taskId}, 状态: ${data.status}, 等待时间: ${waitTime}秒`);
        return NextResponse.json({
          taskId: data.id,
          status: data.status,
          prompt: data.prompt,
          style: data.style,
          createdAt: data.created_at,
          waitTime: waitTime
        });
    }
    
  } catch (error) {
    console.error(`[TaskStatus API] 处理任务状态查询失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: '查询任务状态失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 