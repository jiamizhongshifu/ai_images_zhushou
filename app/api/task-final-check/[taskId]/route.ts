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

// 定义HTTP GET请求处理函数
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const resolvedParams = await params;
  const requestId = crypto.randomUUID().substring(0, 8);
  const startTime = Date.now();
  logger.info(`[${requestId}] 开始执行任务终止检查: ${resolvedParams.taskId}`);

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

    // 判断请求是内部请求还是外部请求
    const authHeader = request.headers.get('authorization') || '';
    const isInternalCall = authHeader.startsWith('Bearer ') && 
      authHeader.substring(7) === process.env.TASK_PROCESS_SECRET_KEY;

    let userId: string | null = null;
    let supabase;

    // 处理外部请求的身份验证
    if (!isInternalCall) {
      // 创建Supabase客户端
      supabase = await createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      // 检查用户是否已登录
      if (!session || !session.user) {
        logger.warn(`[${requestId}] 未认证用户尝试访问任务: ${taskId}`);
        return NextResponse.json(
          { error: '需要用户认证' },
          { status: 401 }
        );
      }
      
      userId = session.user.id;
      logger.info(`[${requestId}] 用户 ${userId} 请求任务终止检查: ${taskId}`);
    } else {
      // 内部调用使用管理员客户端
      supabase = await createAdminClient();
      logger.info(`[${requestId}] 内部服务请求任务终止检查: ${taskId}`);
    }

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

    // 如果是外部请求，验证用户是否有权限访问该任务
    if (!isInternalCall && task.user_id !== userId) {
      logger.warn(`[${requestId}] 用户 ${userId} 无权访问任务: ${taskId}`);
      return NextResponse.json(
        { error: '无权访问此任务' },
        { status: 403 }
      );
    }

    // 处理待处理状态超时的任务
    const MAX_PENDING_TIME = 5 * 60 * 1000; // 5分钟
    const MAX_PROCESSING_TIME = 10 * 60 * 1000; // 10分钟

    const currentStatus = task.status;
    const createdAt = new Date(task.created_at).getTime();
    const now = Date.now();
    
    // 计算任务等待时间
    const waitTime = now - createdAt;
    
    let needsTermination = false;
    let terminationReason = '';
    
    // 检查任务是否需要终止
    if (currentStatus === 'pending' && waitTime > MAX_PENDING_TIME) {
      needsTermination = true;
      terminationReason = `待处理任务超时(${Math.round(waitTime / 1000)}秒)`;
    } else if (currentStatus === 'processing' && waitTime > MAX_PROCESSING_TIME) {
      needsTermination = true;
      terminationReason = `处理中任务超时(${Math.round(waitTime / 1000)}秒)`;
    } else if (currentStatus === 'cancelled') {
      // 已取消的任务无需进一步操作
      logger.info(`[${requestId}] 任务已被取消: ${taskId}`);
      return NextResponse.json({
        taskId,
        status: 'cancelled',
        needsTermination: false,
        message: '任务已被取消'
      });
    } else if (currentStatus === 'completed' || currentStatus === 'failed') {
      // 已完成或失败的任务无需进一步操作
      logger.info(`[${requestId}] 任务已在终态(${currentStatus}): ${taskId}`);
      return NextResponse.json({
        taskId,
        status: currentStatus,
        needsTermination: false,
        message: `任务已在终态(${currentStatus})`
      });
    }
    
    // 如果任务需要终止
    if (needsTermination) {
      logger.warn(`[${requestId}] 任务${taskId}需要终止: ${terminationReason}`);
      
      // 使用管理员客户端更新任务状态
      const supabaseAdmin = await createAdminClient();
      const { error: updateError } = await supabaseAdmin
        .from('image_tasks')
        .update({
          status: 'failed',
          error_message: `任务自动终止: ${terminationReason}`,
          updated_at: new Date().toISOString()
        })
        .eq('task_id', taskId);
        
      if (updateError) {
        logger.error(`[${requestId}] 终止任务时出错: ${updateError.message}`);
        return NextResponse.json(
          { error: '终止任务失败', details: updateError.message },
          { status: 500 }
        );
      }
      
      logger.info(`[${requestId}] 已成功终止任务: ${taskId}`);
      
      // 尝试通知前端任务已终止
      try {
        // 获取环境变量
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const secretKey = process.env.TASK_PROCESS_SECRET_KEY;
        
        // 构建请求URL
        const notifyUrl = `${siteUrl}/api/task-notification`;
        
        // 准备请求数据
        const notifyData = {
          taskId,
          status: 'failed',
          error: `任务自动终止: ${terminationReason}`,
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
        
        logger.info(`[${requestId}] 已发送任务终止通知: ${taskId}`);
      } catch (notifyError) {
        logger.warn(`[${requestId}] 发送任务终止通知失败: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`);
        // 通知失败不影响主要流程
      }
      
      return NextResponse.json({
        taskId,
        status: 'failed',
        needsTermination: true,
        terminationReason,
        message: '任务已被终止'
      });
    }
    
    // 如果任务正常
    logger.info(`[${requestId}] 任务正常，无需终止: ${taskId}，状态: ${currentStatus}，等待时间: ${Math.round(waitTime / 1000)}秒`);
    return NextResponse.json({
      taskId,
      status: currentStatus,
      needsTermination: false,
      waitTime: Math.round(waitTime / 1000),
      message: '任务正常'
    });
  } catch (error) {
    // 处理未预期的错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] 执行任务终止检查时发生未预期错误: ${errorMessage}`, error);
    
    return NextResponse.json(
      { error: '处理任务终止检查请求时出错', details: errorMessage },
      { status: 500 }
    );
  } finally {
    logger.info(`[${requestId}] 任务终止检查完成，耗时: ${Date.now() - startTime}ms`);
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