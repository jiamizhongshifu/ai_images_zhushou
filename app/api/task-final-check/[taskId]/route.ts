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
 * 任务最终状态检查API
 * 直接从数据库获取任务状态，作为备用方案
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  try {
    // 生成请求ID
    const requestId = Math.random().toString(36).substring(2, 10);
    
    // 获取任务ID
    const params = await context.params;
    const { taskId } = params;
    
    logger.info(`[${requestId}] 获取任务${taskId}的最终状态`);
    
    if (!taskId) {
      logger.warn(`[${requestId}] 缺少任务ID参数`);
      return NextResponse.json(
        { success: false, error: '缺少任务ID' },
        { status: 400 }
      );
    }
    
    // 检查是否是内部调用
    const isInternalCall = request.headers.get('authorization') === `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`;
    
    // 获取Supabase客户端
    const supabase = await createClient();
    
    // 验证权限
    if (!isInternalCall) {
      // 非内部调用需要验证用户身份
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        logger.warn(`[${requestId}] 用户未认证，拒绝访问`);
        return NextResponse.json(
          { success: false, error: '未授权访问' },
          { status: 401 }
        );
      }
      
      // 检查用户是否有权限访问该任务
      const { data: taskData, error: taskError } = await supabase
        .from('image_tasks')
        .select('user_id, status, image_url, error_message, created_at, updated_at, completed_at')
        .eq('task_id', taskId)
        .single();
      
      if (taskError) {
        if (taskError.code === 'PGRST116') {
          logger.warn(`[${requestId}] 任务${taskId}不存在`);
          return NextResponse.json(
            { success: false, error: '任务不存在' },
            { status: 404 }
          );
        }
        
        logger.error(`[${requestId}] 查询任务时出错: ${taskError.message}`);
        return NextResponse.json(
          { success: false, error: `查询失败: ${taskError.message}` },
          { status: 500 }
        );
      }
      
      if (!taskData) {
        logger.warn(`[${requestId}] 任务${taskId}不存在`);
        return NextResponse.json(
          { success: false, error: '任务不存在' },
          { status: 404 }
        );
      }
      
      if (taskData.user_id !== user.id) {
        logger.warn(`[${requestId}] 用户${user.id}无权访问任务${taskId}`);
        return NextResponse.json(
          { success: false, error: '无权访问该任务' },
          { status: 403 }
        );
      }
      
      // 计算等待时间
      const waitTime = Math.floor((Date.now() - new Date(taskData.created_at).getTime()) / 1000);
      
      // 返回任务状态
      return NextResponse.json({
        success: true,
        taskId,
        status: taskData.status,
        imageUrl: taskData.image_url,
        error: taskData.error_message,
        waitTime,
        created_at: taskData.created_at,
        updated_at: taskData.updated_at,
        completed_at: taskData.completed_at
      });
    } else {
      // 内部调用可以直接访问所有任务
      logger.info(`[${requestId}] 内部调用，查询任务${taskId}`);
      
      const { data: taskData, error: taskError } = await supabase
        .from('image_tasks')
        .select('*')
        .eq('task_id', taskId)
        .single();
      
      if (taskError) {
        logger.error(`[${requestId}] 内部调用查询任务失败: ${taskError.message}`);
        return NextResponse.json(
          { success: false, error: `查询失败: ${taskError.message}` },
          { status: 500 }
        );
      }
      
      if (!taskData) {
        logger.warn(`[${requestId}] 任务${taskId}不存在`);
        return NextResponse.json(
          { success: false, error: '任务不存在' },
          { status: 404 }
        );
      }
      
      const waitTime = Math.floor((Date.now() - new Date(taskData.created_at).getTime()) / 1000);
      
      // 返回完整任务信息
      return NextResponse.json({
        success: true,
        task: taskData,
        waitTime
      });
    }
  } catch (error) {
    logger.error(`处理任务最终检查请求失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { success: false, error: '处理请求失败' },
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