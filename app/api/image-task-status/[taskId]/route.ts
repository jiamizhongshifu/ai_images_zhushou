import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { logger } from '@/utils/logger';

const STATUS_TIMEOUT_SEC = 360; // 6分钟超时

/**
 * 任务状态API
 * 获取指定任务ID的状态信息
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const { taskId } = params;
  
  if (!taskId) {
    logger.warn('[任务状态API] 缺少任务ID参数');
    return NextResponse.json(
      { error: '缺少任务ID参数' },
      { status: 400 }
    );
  }
  
  logger.info(`[任务状态API] 获取任务状态: ${taskId}`);
  
  try {
    // 创建Supabase客户端
    const supabase = await createClient();
    
    // 检查用户是否已认证
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      logger.warn(`[任务状态API] 未认证访问: ${taskId}`);
      return NextResponse.json(
        { error: '未授权访问' },
        { status: 401 }
      );
    }
    
    // 查询任务状态
    const { data: task, error } = await supabase
      .from('image_tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', user.id)
      .maybeSingle();  // 使用maybeSingle避免在任务不存在时抛出错误
      
    if (error) {
      logger.error(`[任务状态API] 数据库查询错误: ${error.message}`);
      return NextResponse.json(
        { error: '查询任务状态失败' },
        { status: 500 }
      );
    }
    
    if (!task) {
      logger.warn(`[任务状态API] 任务不存在或不属于当前用户: ${taskId}`);
      return NextResponse.json(
        { error: '任务不存在或不属于当前用户', status: 'not_found' },
        { status: 404 }
      );
    }
    
    // 检查任务是否处于"processing"状态但已超时
    if (task.status === 'processing') {
      const createdAt = new Date(task.created_at);
      const now = new Date();
      const durationSec = (now.getTime() - createdAt.getTime()) / 1000;
      
      // 如果任务处理时间超过6分钟且仍在processing状态，认为超时
      if (durationSec > STATUS_TIMEOUT_SEC) {
        logger.warn(`[任务状态API] 任务处理超时: ${taskId} (${Math.round(durationSec)}秒)`);
        
        // 尝试更新任务状态为失败
        try {
          const { error: updateError } = await supabase
            .from('image_tasks')
            .update({
              status: 'failed',
              error_message: '任务处理超时，请重试',
              updated_at: new Date().toISOString()
            })
            .eq('id', taskId)
            .eq('user_id', user.id)
            .eq('status', 'processing');
          
          if (updateError) {
            logger.error(`[任务状态API] 更新超时任务状态失败: ${updateError.message}`);
          } else {
            logger.info(`[任务状态API] 已将超时任务 ${taskId} 标记为失败`);
            // 返回更新后的状态
            return NextResponse.json({
              taskId: task.id,
              status: 'failed',
              error: '任务处理超时，请重试',
              created_at: task.created_at,
              updated_at: new Date().toISOString(),
              waitTime: Math.round(durationSec)
            });
          }
        } catch (updateErr) {
          logger.error('[任务状态API] 更新任务状态时异常:', updateErr);
        }
      }
    }
    
    // 构造响应
    const response: any = {
      taskId: task.id,
      status: task.status,
      created_at: task.created_at,
      updated_at: task.updated_at
    };
    
    // 添加状态相关的字段
    if (task.status === 'completed') {
      response.imageUrl = task.image_url;
      response.completed_at = task.completed_at;
    } else if (task.status === 'failed') {
      response.error = task.error_message || '图片生成失败';
    } else if (task.status === 'processing') {
      // 计算等待时间
      const createdAt = new Date(task.created_at);
      const now = new Date();
      const waitTime = Math.round((now.getTime() - createdAt.getTime()) / 1000);
      
      // 估算进度
      response.waitTime = waitTime;
      response.progress = estimateProgress(waitTime);
      response.stage = getStageFromWaitTime(waitTime);
      
      // 添加尝试次数
      if (task.attempt_count !== undefined) {
        response.attempts = task.attempt_count;
      }
    }
    
    // 如果有其他自定义字段，添加它们
    if (task.progress_percentage !== undefined) {
      response.progress = task.progress_percentage;
    }
    
    if (task.current_stage) {
      response.stage = task.current_stage;
    }
    
    logger.info(`[任务状态API] 返回任务状态: ${taskId} = ${task.status}`);
    return NextResponse.json(response);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[任务状态API] 处理请求时出错: ${errorMessage}`);
    
    return NextResponse.json(
      { error: '获取任务状态失败' },
      { status: 500 }
    );
  }
}

/**
 * 根据等待时间估算进度百分比
 */
function estimateProgress(waitTime: number): number {
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
 */
function getStageFromWaitTime(waitTime: number): string {
  if (waitTime < 5) return 'preparing';
  if (waitTime < 10) return 'configuring';
  if (waitTime < 15) return 'sending_request';
  if (waitTime < 60) return 'processing';
  if (waitTime < 120) return 'processing';
  if (waitTime < 180) return 'finalizing';
  return 'waiting_for_completion';
} 