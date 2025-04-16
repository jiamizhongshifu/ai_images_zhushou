import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// 日志工具函数
const logger = {
  error: (message: string) => {
    console.error(`[UpdateProgress API] ${message}`);
  },
  warn: (message: string) => {
    console.warn(`[UpdateProgress API] ${message}`);
  },
  info: (message: string) => {
    console.log(`[UpdateProgress API] ${message}`);
  },
  debug: (message: string) => {
    console.log(`[UpdateProgress API] ${message}`);
  }
};

/**
 * 更新任务进度API端点
 * 接收任务ID、进度和阶段，更新数据库中的任务状态
 */
export async function POST(request: NextRequest) {
  try {
    // 生成请求ID，用于跟踪日志
    const requestId = Math.random().toString(36).substring(2, 10);
    
    // 验证API密钥
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ') || authHeader.replace('Bearer ', '') !== process.env.TASK_PROCESS_SECRET_KEY) {
      logger.warn(`[${requestId}] 未授权的请求`);
      return NextResponse.json(
        { error: '未授权访问', code: 'unauthorized' },
        { status: 401 }
      );
    }
    
    // 获取请求体
    const body = await request.json();
    const { taskId, progress, stage } = body;
    
    logger.info(`[${requestId}] 更新任务进度: ${taskId}, 进度: ${progress}, 阶段: ${stage}`);
    
    if (!taskId) {
      logger.warn(`[${requestId}] 缺少任务ID`);
      return NextResponse.json(
        { error: '缺少任务ID', code: 'missing_task_id' },
        { status: 400 }
      );
    }
    
    if (progress === undefined || progress === null) {
      logger.warn(`[${requestId}] 缺少进度值`);
      return NextResponse.json(
        { error: '缺少进度值', code: 'missing_progress' },
        { status: 400 }
      );
    }
    
    // 创建Supabase客户端
    const supabase = await createClient();
    
    // 更新任务进度
    const { data, error } = await supabase
      .from('image_tasks')
      .update({
        progress: progress,
        stage: stage || null,
        updated_at: new Date().toISOString()
      })
      .eq('task_id', taskId)
      .select('task_id, status')
      .single();
    
    if (error) {
      logger.error(`[${requestId}] 更新任务进度失败: ${error.message}`);
      return NextResponse.json(
        { error: '更新任务进度失败', details: error.message, code: 'update_error' },
        { status: 500 }
      );
    }
    
    logger.info(`[${requestId}] 任务进度更新成功: ${taskId}, 进度: ${progress}, 阶段: ${stage}`);
    
    return NextResponse.json({
      success: true,
      taskId: taskId,
      progress: progress,
      stage: stage,
      task: data
    });
    
  } catch (error) {
    logger.error(`处理任务进度更新失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: '更新任务进度失败', details: error instanceof Error ? error.message : String(error), code: 'server_error' },
      { status: 500 }
    );
  }
} 