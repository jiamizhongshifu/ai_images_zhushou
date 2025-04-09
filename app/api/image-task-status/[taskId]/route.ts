import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    // 获取任务ID
    const { taskId } = params;
    
    if (!taskId) {
      return NextResponse.json(
        { error: '缺少任务ID' },
        { status: 400 }
      );
    }
    
    // 获取用户信息
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: '未授权访问' },
        { status: 401 }
      );
    }
    
    // 查询任务状态
    const { data, error } = await supabase
      .from('image_tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      console.error(`查询任务状态失败: ${error.message}`);
      return NextResponse.json(
        { error: '查询任务状态失败', details: error.message },
        { status: 500 }
      );
    }
    
    if (!data) {
      return NextResponse.json(
        { error: '任务不存在或无权访问' },
        { status: 404 }
      );
    }
    
    // 根据任务状态返回不同的响应
    switch (data.status) {
      case 'completed':
        return NextResponse.json({
          taskId: data.id,
          status: 'completed',
          imageUrl: data.image_url,
          prompt: data.prompt,
          style: data.style,
          completedAt: data.completed_at
        });
        
      case 'failed':
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
        return NextResponse.json({
          taskId: data.id,
          status: data.status,
          prompt: data.prompt,
          style: data.style,
          createdAt: data.created_at,
          // 如果有进度信息，也可以返回
          waitTime: Math.floor((Date.now() - new Date(data.created_at).getTime()) / 1000)
        });
    }
    
  } catch (error) {
    console.error(`处理任务状态查询失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: '查询任务状态失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 