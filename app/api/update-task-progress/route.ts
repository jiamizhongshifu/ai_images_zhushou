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
    
    // 增强的认证机制：支持多种认证头格式
    let isAuthorized = false;
    const validKeys = [
      process.env.TASK_PROCESS_SECRET_KEY,
      process.env.INTERNAL_API_KEY,
      process.env.API_SECRET_KEY,
      'development-key' // 开发环境备用密钥
    ].filter(Boolean); // 过滤掉undefined和空字符串
    
    if (validKeys.length === 0) {
      logger.warn(`[${requestId}] 警告: 未配置任何有效的API密钥`);
    }
    
    // 获取认证头 - 支持多种格式
    const authHeader = request.headers.get('authorization') || '';
    const xApiKey = request.headers.get('x-api-key') || request.headers.get('X-API-Key') || '';
    
    // 检查Authorization头
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      isAuthorized = validKeys.some(key => key === token);
      
      if (isAuthorized) {
        logger.info(`[${requestId}] 使用Bearer认证成功`);
      }
    }
    
    // 检查X-API-Key头
    if (!isAuthorized && xApiKey) {
      isAuthorized = validKeys.some(key => key === xApiKey);
      
      if (isAuthorized) {
        logger.info(`[${requestId}] 使用X-API-Key认证成功`);
      }
    }
    
    // 认证失败
    if (!isAuthorized) {
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
    
    // 更新任务进度 - 添加错误重试机制
    let updateResult = null;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
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
          // 特定错误情况可以重试
          if (error.code === 'PGRST116' || error.code === '23505') {
            logger.warn(`[${requestId}] 更新任务进度遇到可恢复错误 (尝试 ${retryCount + 1}/${maxRetries + 1}): ${error.message}`);
            retryCount++;
            // 等待短暂时间后重试
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          
          logger.error(`[${requestId}] 更新任务进度失败: ${error.message}`);
          return NextResponse.json(
            { error: '更新任务进度失败', details: error.message, code: 'update_error' },
            { status: 500 }
          );
        }
        
        updateResult = data;
        break; // 成功更新，跳出循环
      } catch (err) {
        logger.error(`[${requestId}] 更新任务进度时发生异常: ${err instanceof Error ? err.message : String(err)}`);
        retryCount++;
        
        if (retryCount > maxRetries) {
          return NextResponse.json(
            { error: '更新任务进度失败', details: String(err), code: 'server_error' },
            { status: 500 }
          );
        }
        
        // 等待短暂时间后重试
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    logger.info(`[${requestId}] 任务进度更新成功: ${taskId}, 进度: ${progress}, 阶段: ${stage}`);
    
    return NextResponse.json({
      success: true,
      taskId: taskId,
      progress: progress,
      stage: stage,
      task: updateResult
    });
    
  } catch (error) {
    logger.error(`处理任务进度更新失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: '更新任务进度失败', details: error instanceof Error ? error.message : String(error), code: 'server_error' },
      { status: 500 }
    );
  }
} 