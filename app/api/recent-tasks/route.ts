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
 * 用于前端自动恢复任务，无需用户手动确认
 */
export async function GET(request: NextRequest) {
  try {
    const requestId = Math.random().toString(36).substring(2, 10);
    logger.info(`[${requestId}] 开始获取用户最近任务`);
    
    // 获取请求参数
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '1'); // 默认只返回最近的1个任务
    const minutes = parseInt(searchParams.get('minutes') || '3'); // 默认查询最近3分钟的任务
    
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
    
    // 获取指定时间范围内创建的任务
    const timeAgo = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    
    // 查询最近创建的任务
    const { data, error } = await supabase
      .from('image_tasks')
      .select('task_id, status, created_at, updated_at, image_url, prompt, style')
      .eq('user_id', user.id)
      .gte('created_at', timeAgo)
      .order('created_at', { ascending: false })
      .limit(limit);
    
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
      return NextResponse.json({
        success: true,
        message: '未找到最近任务', 
        tasks: []
      });
    }
    
    // 格式化任务数据
    const tasks = data.map(task => ({
      taskId: task.task_id,
      status: task.status,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      imageUrl: task.image_url,
      prompt: task.prompt,
      style: task.style
    }));
    
    logger.info(`[${requestId}] 成功获取用户最近任务，共${tasks.length}个任务`);
    
    // 返回任务列表
    return NextResponse.json({
      success: true,
      tasks: tasks
    });
    
  } catch (error) {
    logger.error(`获取最近任务失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { 
        success: false,
        error: '获取最近任务失败', 
        details: error instanceof Error ? error.message : String(error),
        code: 'server_error' 
      },
      { status: 500 }
    );
  }
} 