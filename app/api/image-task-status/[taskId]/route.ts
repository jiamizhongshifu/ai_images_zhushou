import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isOpenAIUrl, isTemporaryUrl } from '@/utils/image/persistImage';
import { getCurrentUser } from '@/app/api/auth-middleware';

// 日志工具函数
const logger = {
  error: (message: string) => {
    console.error(`[TaskStatus API] ${message}`);
  },
  warn: (message: string) => {
    console.warn(`[TaskStatus API] ${message}`);
  },
  info: (message: string) => {
    console.log(`[TaskStatus API] ${message}`);
  },
  debug: (message: string) => {
    console.log(`[TaskStatus API] ${message}`);
  }
};

/**
 * 获取任务状态和进度信息
 * 
 * @param request 请求对象
 * @param context 路由上下文，包含任务ID
 * @returns 任务状态和进度信息
 */
export async function GET(
  request: NextRequest,
  context: { params: { taskId: string } }
) {
  try {
    // 获取任务ID
    const taskId = context.params.taskId;
    
    if (!taskId) {
      return NextResponse.json(
        { error: '缺少任务ID参数' },
        { status: 400 }
      );
    }
    
    // 查询数据库获取任务信息
    const supabase = await createClient();

    // 获取当前用户
    const user = await getCurrentUser(supabase);
    
    if (!user) {
      return NextResponse.json(
        { error: '未授权访问' },
        { status: 401 }
      );
    }
    
    // 查询数据库获取任务信息
    const { data: task, error } = await supabase
      .from('image_tasks')
      .select(`
        task_id,
        status,
        image_url,
        error_message,
        created_at,
        updated_at,
        progress_percentage,
        current_stage,
        stage_details
      `)
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      console.error('查询任务状态出错:', error);
      return NextResponse.json(
        { error: '查询任务状态失败' },
        { status: 500 }
      );
    }
    
    if (!task) {
      return NextResponse.json(
        { error: '未找到指定任务' },
        { status: 404 }
      );
    }
    
    // 返回任务信息
    return NextResponse.json({
      task: {
        taskId: task.task_id,
        status: task.status,
        imageUrl: task.image_url,
        errorMessage: task.error_message,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        progress_percentage: task.progress_percentage || 0,
        current_stage: task.current_stage || '',
        stage_details: task.stage_details || null
      }
    });
  } catch (error) {
    console.error('获取任务状态出错:', error);
    return NextResponse.json(
      { error: '处理请求时出错' },
      { status: 500 }
    );
  }
}

/**
 * 根据等待时间计算估计进度
 * @param waitTime 等待时间（秒）
 * @returns 估计进度（0-100）
 */
function calculateProgress(waitTime: number): number {
  if (waitTime < 5) return 5;
  if (waitTime < 10) return 10;
  if (waitTime < 20) return 20;
  if (waitTime < 30) return 30;
  if (waitTime < 60) return 30 + Math.min(30, waitTime / 2);
  if (waitTime < 120) return Math.min(80, 60 + waitTime / 6);
  
  // 超过120秒后进度缓慢增加
  return Math.min(95, 80 + (waitTime - 120) / 12);
}

/**
 * 根据等待时间确定处理阶段
 * @param waitTime 等待时间（秒）
 * @returns 处理阶段描述
 */
function determineProcessingStage(waitTime: number): string {
  if (waitTime < 5) return 'preparing';
  if (waitTime < 10) return 'configuring';
  if (waitTime < 15) return 'sending_request';
  if (waitTime < 60) return 'processing';
  if (waitTime < 120) return 'processing';
  if (waitTime < 150) return 'extracting_image';
  return 'finalizing';
} 