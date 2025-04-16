import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isOpenAIUrl, isTemporaryUrl } from '@/utils/image/persistImage';

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
 * 任务状态查询API端点
 * 主要用于前端轮询任务状态
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  try {
    // 生成请求ID，用于跟踪日志
    const requestId = Math.random().toString(36).substring(2, 10);
    
    // 获取任务ID - 注意Next.js 15需要await params
    const params = await context.params;
    const { taskId } = params;
    
    logger.info(`[${requestId}] 获取任务状态: ${taskId}`);
    
    if (!taskId) {
      logger.warn(`[${requestId}] 缺少任务ID`);
      return NextResponse.json(
        { error: '缺少任务ID', code: 'missing_task_id' },
        { status: 400 }
      );
    }
    
    // 检查是否是内部调用（后台服务）
    const isInternalCall = request.headers.get('authorization') === `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`;
    
    // 获取用户信息（如果不是内部调用）
    const supabase = await createClient();
    
    if (!isInternalCall) {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (!user) {
        logger.warn(`[${requestId}] 用户未认证`);
        return NextResponse.json(
          { error: '未授权访问', code: 'unauthorized' },
          { status: 401 }
        );
      }
      
      logger.info(`[${requestId}] 用户已认证: ${user.id}, 查询任务: ${taskId}`);
      
      // 查询任务状态 - 只能查询自己的任务
      const { data, error } = await supabase
        .from('image_tasks')
        .select('*')
        .eq('task_id', taskId)
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        // 如果任务不存在，也视为"已取消"
        if (error.code === 'PGRST116') {
          logger.warn(`[${requestId}] 任务不存在: ${taskId}`);
          return NextResponse.json(
            { error: '任务不存在或无权访问', code: 'task_not_found' },
            { status: 404 }
          );
        }
        
        logger.error(`[${requestId}] 查询任务状态失败: ${error.message}`);
        return NextResponse.json(
          { error: '查询任务状态失败', details: error.message, code: 'query_error' },
          { status: 500 }
        );
      }
      
      if (!data) {
        logger.warn(`[${requestId}] 任务不存在或无权访问: ${taskId}`);
        return NextResponse.json(
          { error: '任务不存在或无权访问', code: 'task_not_found' },
          { status: 404 }
        );
      }
      
      // 检查如果任务已完成并且有图片URL，尝试启动持久化处理
      if (data.status === 'completed' && data.image_url) {
        // 检查图片URL是否需要持久化处理
        const needsPersistence = isOpenAIUrl(data.image_url) || isTemporaryUrl(data.image_url);
        
        if (needsPersistence && !data.is_persisting && !data.original_image_url) {
          logger.info(`[${requestId}] 检测到需要持久化的图片URL: ${data.image_url.substring(0, 50)}...`);
          
          // 标记图片正在进行持久化处理
          await supabase
            .from('image_tasks')
            .update({
              is_persisting: true,
              updated_at: new Date().toISOString()
            })
            .eq('task_id', taskId);
          
          // 异步触发持久化处理，不等待结果
          fetch(`${request.nextUrl.origin}/api/persist-image/${taskId}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY || ''}`
            }
          }).catch(err => {
            logger.error(`[${requestId}] 触发图片持久化失败: ${err.message}`);
          });
          
          logger.info(`[${requestId}] 已触发图片持久化处理`);
        }
      }
      
      // 构建响应数据，确保包含必要的字段，并处理可能不存在的字段
      const responseData = {
        taskId: data.task_id,
        status: data.status || 'pending',
        imageUrl: data.image_url || null,
        error: data.error_message || null,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
        completed_at: data.completed_at || null,
        prompt: data.prompt || '',
        style: data.style || null,
        progress: data.progress || null,
        stage: data.stage || null
      };
      
      // 计算额外信息
      const createdTime = new Date(data.created_at).getTime();
      const now = Date.now();
      const waitTime = Math.floor((now - createdTime) / 1000);
      
      logger.debug(`[${requestId}] 任务 ${taskId} 等待时间: ${waitTime}秒`);
      
      // 根据任务状态返回不同的响应
      switch (data.status) {
        case 'completed':
          logger.info(`[${requestId}] 任务已完成: ${taskId}`);
          return NextResponse.json({
            ...responseData,
            waitTime: 0,
            isSuccess: true,
            progress: 100,
            stage: 'completed'
          });
          
        case 'failed':
          logger.info(`[${requestId}] 任务失败: ${taskId}, 错误: ${data.error_message}`);
          return NextResponse.json({
            ...responseData,
            waitTime: waitTime,
            isSuccess: false,
            progress: data.progress || 0,
            stage: data.stage || 'failed'
          });
          
        case 'cancelled':
          logger.info(`[${requestId}] 任务已取消: ${taskId}`);
          return NextResponse.json({
            ...responseData,
            waitTime: 0,
            isSuccess: false,
            code: 'task_cancelled',
            progress: data.progress || 0,
            stage: 'cancelled'
          });
          
        case 'pending':
        case 'processing':
        default:
          logger.info(`[${requestId}] 任务处理中: ${taskId}, 状态: ${data.status}, 等待时间: ${waitTime}秒`);
          
          // 优先使用数据库中存储的真实进度，如果没有则使用估算进度
          const actualProgress = data.progress !== null ? data.progress : calculateProgress(waitTime);
          const actualStage = data.stage || determineProcessingStage(waitTime);
          
          return NextResponse.json({
            ...responseData,
            waitTime: waitTime,
            estimatedProgress: calculateProgress(waitTime),
            processingStage: determineProcessingStage(waitTime),
            progress: actualProgress,
            stage: actualStage
          });
      }
    } else {
      // 内部调用，可以查询任何任务
      logger.info(`[${requestId}] 内部调用，查询任务: ${taskId}`);
      
      const { data, error } = await supabase
        .from('image_tasks')
        .select('*')
        .eq('task_id', taskId)
        .single();
      
      if (error) {
        logger.error(`[${requestId}] 内部调用查询任务失败: ${error.message}`);
        return NextResponse.json(
          { error: '查询任务失败', details: error.message, code: 'query_error' },
          { status: 500 }
        );
      }
      
      if (!data) {
        logger.warn(`[${requestId}] 内部调用任务不存在: ${taskId}`);
        return NextResponse.json(
          { error: '任务不存在', code: 'task_not_found' },
          { status: 404 }
        );
      }
      
      // 内部调用也检查并触发图片持久化
      if (data.status === 'completed' && data.image_url) {
        // 检查图片URL是否需要持久化处理
        const needsPersistence = isOpenAIUrl(data.image_url) || isTemporaryUrl(data.image_url);
        
        if (needsPersistence && !data.is_persisting && !data.original_image_url) {
          logger.info(`[${requestId}] 内部调用-检测到需要持久化的图片URL: ${data.image_url.substring(0, 50)}...`);
          
          // 标记图片正在进行持久化处理
          await supabase
            .from('image_tasks')
            .update({
              is_persisting: true,
              updated_at: new Date().toISOString()
            })
            .eq('task_id', taskId);
          
          // 异步触发持久化处理，不等待结果
          fetch(`${request.nextUrl.origin}/api/persist-image/${taskId}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY || ''}`
            }
          }).catch(err => {
            logger.error(`[${requestId}] 内部调用-触发图片持久化失败: ${err.message}`);
          });
          
          logger.info(`[${requestId}] 内部调用-已触发图片持久化处理`);
        }
      }
      
      const waitTime = Math.floor((Date.now() - new Date(data.created_at).getTime()) / 1000);
      
      return NextResponse.json({
        taskId: data.task_id,
        userId: data.user_id,
        status: data.status,
        imageUrl: data.image_url,
        error: data.error_message,
        created_at: data.created_at,
        updated_at: data.updated_at,
        completed_at: data.completed_at,
        waitTime: waitTime,
        attempt_count: data.attempt_count || 0,
        model: data.model || 'unknown',
        progress: data.progress || null,
        stage: data.stage || null
      });
    }
    
  } catch (error) {
    logger.error(`处理任务状态查询失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: '查询任务状态失败', details: error instanceof Error ? error.message : String(error), code: 'server_error' },
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