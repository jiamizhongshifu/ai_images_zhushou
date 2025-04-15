import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
// import { getLogger } from '@/utils/logger';

// const logger = getLogger('task-final-check-api');

// 日志工具函数
const logger = {
  error: (message: string, ...args: any[]) => {
    console.error(`[任务终止检查API] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[任务终止检查API] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    console.log(`[任务终止检查API] ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    console.log(`[任务终止检查API] ${message}`, ...args);
  }
};

/**
 * 任务最终状态查询API
 * 此端点绕过缓存和中间状态，直接查询数据库中的实际任务状态
 * 主要用于在网络错误或其他前端问题时，获取任务的真实状态
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
    
    logger.info(`[${requestId}] 最终状态检查: ${taskId}`);
    
    if (!taskId) {
      logger.warn(`[${requestId}] 缺少任务ID`);
      return NextResponse.json(
        { error: '缺少任务ID', code: 'missing_task_id' },
        { status: 400 }
      );
    }
    
    // 创建Supabase客户端
    const supabase = await createClient();
    
    // 尝试获取用户信息
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // 如果没有用户认证，返回错误
    if (authError || !user) {
      logger.warn(`[${requestId}] 用户未认证，无法执行最终状态检查`);
      return NextResponse.json(
        { error: '未授权访问', code: 'unauthorized' },
        { status: 401 }
      );
    }
    
    logger.info(`[${requestId}] 用户已认证: ${user.id}, 最终状态检查: ${taskId}`);
    
    // 直接查询数据库，跳过缓存和缓存验证
    const { data, error } = await supabase
      .from('image_tasks')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      logger.error(`[${requestId}] 最终状态检查失败: ${error.message}`);
      
      // 任务不存在的情况
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { 
            status: 'unknown',
            error: '任务不存在或无权访问', 
            code: 'task_not_found' 
          },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { 
          status: 'unknown',
          error: '查询任务状态失败', 
          details: error.message, 
          code: 'query_error' 
        },
        { status: 500 }
      );
    }
    
    if (!data) {
      logger.warn(`[${requestId}] 最终状态检查: 任务不存在或无权访问: ${taskId}`);
      return NextResponse.json(
        { 
          status: 'unknown',
          error: '任务不存在或无权访问', 
          code: 'task_not_found' 
        },
        { status: 404 }
      );
    }
    
    // 构建结果
    const result = {
      taskId: data.task_id,
      status: data.status || 'pending',
      imageUrl: data.image_url || null,
      error: data.error_message || null,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
      completed_at: data.completed_at || null
    };
    
    logger.info(`[${requestId}] 最终状态检查成功，任务 ${taskId} 实际状态为: ${result.status}`);
    
    // 返回详细信息
    return NextResponse.json(result);
    
  } catch (error) {
    logger.error(`最终状态检查失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { 
        status: 'unknown',
        error: '最终状态检查失败', 
        details: error instanceof Error ? error.message : String(error),
        code: 'server_error' 
      },
      { status: 500 }
    );
  }
}

// 定义HTTP POST请求处理函数，用于主动取消任务
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const resolvedParams = await params;
  const requestId = crypto.randomUUID().substring(0, 8);
  const startTime = Date.now();
  logger.info(`[${requestId}] 开始执行任务取消操作: ${resolvedParams.taskId}`);

  try {
    // 验证任务ID参数是否存在
    const taskId = resolvedParams.taskId;
    if (!taskId) {
      logger.error(`[${requestId}] 缺少任务ID参数`);
      return NextResponse.json(
        { error: '缺少任务ID参数' },
        { status: 400 }
      );
    }

    // 创建Supabase客户端
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    // 检查用户是否已登录
    if (!session || !session.user) {
      logger.warn(`[${requestId}] 未认证用户尝试取消任务: ${taskId}`);
      return NextResponse.json(
        { error: '需要用户认证' },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;
    logger.info(`[${requestId}] 用户 ${userId} 请求取消任务: ${taskId}`);

    // 查询任务信息
    const { data: task, error: queryError } = await supabase
      .from('image_tasks')
      .select('*')
      .eq('task_id', taskId)
      .single();

    // 处理查询错误
    if (queryError) {
      logger.error(`[${requestId}] 查询任务出错: ${queryError.message}`);
      return NextResponse.json(
        { error: '无法查询任务信息', details: queryError.message },
        { status: 500 }
      );
    }

    // 检查任务是否存在
    if (!task) {
      logger.error(`[${requestId}] 任务不存在: ${taskId}`);
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      );
    }

    // 验证用户是否有权限取消该任务
    if (task.user_id !== userId) {
      logger.warn(`[${requestId}] 用户 ${userId} 无权取消任务: ${taskId}`);
      return NextResponse.json(
        { error: '无权取消此任务' },
        { status: 403 }
      );
    }

    // 检查任务状态是否允许取消
    const currentStatus = task.status;
    if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled') {
      logger.info(`[${requestId}] 任务已在终态(${currentStatus})，无法取消: ${taskId}`);
      return NextResponse.json({
        taskId,
        status: currentStatus,
        cancelled: false,
        message: `任务已在终态(${currentStatus})，无法取消`
      });
    }

    // 取消任务
    const { error: updateError } = await supabase
      .from('image_tasks')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('task_id', taskId);
      
    if (updateError) {
      logger.error(`[${requestId}] 取消任务时出错: ${updateError.message}`);
      return NextResponse.json(
        { error: '取消任务失败', details: updateError.message },
        { status: 500 }
      );
    }
    
    logger.info(`[${requestId}] 已成功取消任务: ${taskId}`);
    
    // 尝试通知前端任务已取消
    try {
      // 获取环境变量
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const secretKey = process.env.TASK_PROCESS_SECRET_KEY;
      
      // 构建请求URL
      const notifyUrl = `${siteUrl}/api/task-notification`;
      
      // 准备请求数据
      const notifyData = {
        taskId,
        status: 'cancelled',
        source: 'task-final-check'
      };
      
      // 发送通知请求
      await fetch(notifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secretKey}`
        },
        body: JSON.stringify(notifyData)
      });
      
      logger.info(`[${requestId}] 已发送任务取消通知: ${taskId}`);
    } catch (notifyError) {
      logger.warn(`[${requestId}] 发送任务取消通知失败: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`);
      // 通知失败不影响主要流程
    }
    
    return NextResponse.json({
      taskId,
      status: 'cancelled',
      cancelled: true,
      message: '任务已成功取消'
    });
  } catch (error) {
    // 处理未预期的错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] 执行任务取消操作时发生未预期错误: ${errorMessage}`, error);
    
    return NextResponse.json(
      { error: '处理任务取消请求时出错', details: errorMessage },
      { status: 500 }
    );
  } finally {
    logger.info(`[${requestId}] 任务取消操作完成，耗时: ${Date.now() - startTime}ms`);
  }
} 