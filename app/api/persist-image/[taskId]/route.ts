import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { persistImageUrl } from '@/utils/image/persistImage'; 
import { createAdminClient } from '@/utils/supabase/admin';

// 日志工具
const logger = {
  info: (message: string) => console.log(`[图片持久化API] ${message}`),
  error: (message: string) => console.error(`[图片持久化API] ${message}`),
  warn: (message: string) => console.warn(`[图片持久化API] ${message}`),
  debug: (message: string) => console.log(`[图片持久化API] ${message}`)
};

/**
 * 图片持久化API端点
 * 用于将任务中的临时图片URL转存为持久化URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    // 获取任务ID
    const taskId = params.taskId;
    
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: '缺少任务ID' },
        { status: 400 }
      );
    }
    
    logger.info(`开始处理任务${taskId}的图片持久化`);
    
    // 检查是否是内部调用
    const isInternalCall = request.headers.get('authorization') === `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`;
    
    // 创建Supabase客户端
    const supabase = isInternalCall 
      ? createAdminClient() 
      : await createClient();
    
    // 获取任务信息
    if (!isInternalCall) {
      // 非内部调用需要验证用户身份
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        logger.warn(`用户未认证，拒绝访问`);
        return NextResponse.json(
          { success: false, error: '未授权访问' },
          { status: 401 }
        );
      }
      
      logger.info(`用户 ${user.id} 请求持久化任务 ${taskId} 的图片`);
      
      // 检查用户是否有权限访问该任务
      const { data: taskData, error: taskError } = await supabase
        .from('image_tasks')
        .select('user_id, status, image_url')
        .eq('task_id', taskId)
        .single();
      
      if (taskError || !taskData) {
        logger.warn(`任务${taskId}不存在或查询出错`);
        return NextResponse.json(
          { success: false, error: '任务不存在或无权访问' },
          { status: 404 }
        );
      }
      
      if (taskData.user_id !== user.id) {
        logger.warn(`用户${user.id}无权访问任务${taskId}`);
        return NextResponse.json(
          { success: false, error: '无权访问该任务' },
          { status: 403 }
        );
      }
      
      if (taskData.status !== 'completed' || !taskData.image_url) {
        logger.warn(`任务${taskId}未完成或没有图片URL`);
        return NextResponse.json(
          { success: false, error: '任务未完成或没有图片URL' },
          { status: 400 }
        );
      }
      
      // 执行图片持久化
      const persistedUrl = await persistImageUrl(
        taskData.image_url,
        taskId,
        user.id
      );
      
      return NextResponse.json({
        success: true,
        taskId,
        originalUrl: taskData.image_url,
        persistedUrl
      });
    } else {
      // 内部调用 - 无需权限验证
      logger.info(`内部系统调用，处理任务${taskId}的图片持久化`);
      
      // 获取任务信息
      const { data: taskData, error: taskError } = await supabase
        .from('image_tasks')
        .select('user_id, status, image_url')
        .eq('task_id', taskId)
        .single();
      
      if (taskError || !taskData) {
        logger.warn(`任务${taskId}不存在或查询出错`);
        return NextResponse.json(
          { success: false, error: '任务不存在' },
          { status: 404 }
        );
      }
      
      if (taskData.status !== 'completed' || !taskData.image_url) {
        logger.warn(`任务${taskId}未完成或没有图片URL`);
        return NextResponse.json(
          { success: false, error: '任务未完成或没有图片URL' },
          { status: 400 }
        );
      }
      
      // 执行图片持久化
      const persistedUrl = await persistImageUrl(
        taskData.image_url,
        taskId,
        taskData.user_id
      );
      
      return NextResponse.json({
        success: true,
        taskId,
        originalUrl: taskData.image_url,
        persistedUrl
      });
    }
  } catch (error) {
    logger.error(`图片持久化处理失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { success: false, error: '图片持久化处理失败' },
      { status: 500 }
    );
  }
} 