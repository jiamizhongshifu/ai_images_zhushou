import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// 日志工具函数
const logger = {
  error: (message: string, ...args: any[]) => {
    console.error(`[最近任务API] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[最近任务API] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    console.log(`[最近任务API] ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    console.log(`[最近任务API] ${message}`, ...args);
  }
};

/**
 * 获取用户最近创建的任务
 * 用于前端恢复临时任务ID到真实任务ID的映射
 */
export async function GET(request: NextRequest) {
  try {
    const requestId = Math.random().toString(36).substring(2, 10);
    logger.info(`[${requestId}] 开始获取用户最近任务`);
    
    // 创建Supabase客户端
    const supabase = await createClient();
    
    // 尝试获取用户信息
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // 如果没有用户认证，返回错误
    if (authError || !user) {
      logger.warn(`[${requestId}] 用户未认证，无法查询最近任务`);
      return NextResponse.json(
        { error: '未授权访问', code: 'unauthorized' },
        { status: 401 }
      );
    }
    
    logger.info(`[${requestId}] 用户已认证: ${user.id}, 开始查询最近任务`);
    
    // 获取当前时间往前30分钟内创建的任务
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    // 查询最近创建的任务
    const { data, error } = await supabase
      .from('image_tasks')
      .select('task_id, status, created_at, updated_at, image_url')
      .eq('user_id', user.id)
      .gte('created_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      logger.error(`[${requestId}] 查询最近任务失败: ${error.message}`);
      return NextResponse.json(
        { 
          error: '查询最近任务失败', 
          details: error.message, 
          code: 'query_error' 
        },
        { status: 500 }
      );
    }
    
    if (!data || data.length === 0) {
      logger.info(`[${requestId}] 未找到最近任务`);
      return NextResponse.json(
        { message: '未找到最近任务', taskId: null, tasks: [] }
      );
    }
    
    // 提取最近的任务
    const latestTask = data[0];
    const allTasks = data.map(task => ({
      taskId: task.task_id,
      status: task.status,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      imageUrl: task.image_url
    }));
    
    logger.info(`[${requestId}] 成功获取用户最近任务，最新任务ID: ${latestTask.task_id}`);
    
    // 返回最近的任务信息和任务列表
    return NextResponse.json({
      taskId: latestTask.task_id,
      status: latestTask.status,
      createdAt: latestTask.created_at,
      tasks: allTasks
    });
    
  } catch (error) {
    logger.error(`获取最近任务失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { 
        error: '获取最近任务失败', 
        details: error instanceof Error ? error.message : String(error),
        code: 'server_error' 
      },
      { status: 500 }
    );
  }
} 