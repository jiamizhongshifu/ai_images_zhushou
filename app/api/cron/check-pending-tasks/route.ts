import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getApiConfig } from '@/utils/env';
import { OpenAI } from 'openai';
import { ImageTask } from '@/types/database';

// 定义TuziConfig类型
interface TuziConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  isConfigComplete: boolean;
}

// 日志工具函数
const logger = {
  error: (message: string) => {
    console.error(`[Cron任务错误] ${message}`);
  },
  info: (message: string) => {
    console.log(`[Cron任务] ${message}`);
  },
  debug: (message: string) => {
    console.log(`[Cron任务调试] ${message}`);
  }
};

// 创建图资API客户端
function createTuziClient() {
  // 获取环境配置
  const apiConfig = getApiConfig('tuzi') as TuziConfig;
  
  // 优先使用环境变量中的配置
  const apiKey = apiConfig.apiKey || process.env.OPENAI_API_KEY;
  const baseURL = apiConfig.apiUrl || process.env.OPENAI_BASE_URL || "https://api.tu-zi.com/v1/chat/completions";
  
  logger.info(`创建图资API客户端，使用BASE URL: ${baseURL}，模型: ${process.env.OPENAI_MODEL || 'gpt-4o-image-vip'}`);
  
  // 返回配置的客户端 - 使用图资API
  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
    defaultQuery: { model: process.env.OPENAI_MODEL || 'gpt-4o-image-vip' }
  });
}

// 设置最大重试次数和任务超时时间
const MAX_RETRY_COUNT = 3;
const TASK_TIMEOUT_MINUTES = 30;

export async function GET(request: Request) {
  try {
    // 检查Secret Key
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const cronSecret = process.env.CRON_SECRET || 'development-key';
    
    // 在生产环境中验证Secret Key
    if (process.env.NODE_ENV === 'production' && key !== cronSecret) {
      logger.error('Cron任务密钥无效');
      return NextResponse.json(
        { error: '访问被拒绝' },
        { status: 403 }
      );
    }
    
    // 获取Supabase Admin客户端
    const supabase = createAdminClient();
    
    // 计算超时时间戳
    const timeoutDate = new Date();
    timeoutDate.setMinutes(timeoutDate.getMinutes() - TASK_TIMEOUT_MINUTES);
    const timeoutTimestamp = timeoutDate.toISOString();
    
    // 获取所有需要处理的任务:
    // 1. 状态为pending的任务
    // 2. 尝试次数小于最大重试次数
    // 3. 创建时间在超时时间内
    const { data: pendingTasks, error } = await supabase
      .from('image_tasks')
      .select('*')
      .eq('status', 'pending')
      .lt('attempt_count', MAX_RETRY_COUNT)
      .gt('created_at', timeoutTimestamp)
      .order('created_at', { ascending: true })
      .limit(10);  // 每次处理10个任务
    
    if (error) {
      logger.error(`获取待处理任务失败: ${error.message}`);
      return NextResponse.json(
        { error: '获取待处理任务失败', details: error.message },
        { status: 500 }
      );
    }
    
    if (!pendingTasks || pendingTasks.length === 0) {
      logger.info('没有需要处理的待处理任务');
      return NextResponse.json({ message: '没有待处理任务' });
    }
    
    logger.info(`找到 ${pendingTasks.length} 个待处理任务`);
    
    // 获取Tuzi客户端
    const tuziClient = createTuziClient();
    
    // 处理每个待处理任务
    const processResults = await Promise.allSettled(
      pendingTasks.map(async (task: ImageTask) => {
        try {
          // 更新尝试次数
          await supabase
            .from('image_tasks')
            .update({
              attempt_count: (task.attempt_count || 0) + 1,
              status: 'processing',
              updated_at: new Date().toISOString()
            })
            .eq('id', task.id);
          
          logger.info(`处理任务 ${task.id}, 尝试次数: ${(task.attempt_count || 0) + 1}`);
          
          // 调用Tuzi API
          const response = await tuziClient.images.generate({
            prompt: task.prompt,
            model: task.model || process.env.OPENAI_MODEL || 'default-model',
            response_format: 'url',
            user: `task_${task.id}_retry_${(task.attempt_count || 0) + 1}`
          });
          
          // 处理成功响应
          if (response && response.data && response.data[0]?.url) {
            logger.info(`任务 ${task.id} 生成成功`);
            await supabase
              .from('image_tasks')
              .update({
                status: 'completed',
                image_url: response.data[0].url,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', task.id);
            
            return { taskId: task.id, success: true };
          } else {
            throw new Error('API返回无效响应');
          }
        } catch (error) {
          logger.error(`处理任务 ${task.id} 失败: ${error instanceof Error ? error.message : String(error)}`);
          
          // 检查是否达到最大重试次数
          if ((task.attempt_count || 0) + 1 >= MAX_RETRY_COUNT) {
            await supabase
              .from('image_tasks')
              .update({
                status: 'failed',
                error_message: `达到最大重试次数(${MAX_RETRY_COUNT})，最后错误: ${error instanceof Error ? error.message : String(error)}`,
                updated_at: new Date().toISOString()
              })
              .eq('id', task.id);
          } else {
            // 重置为pending状态，让下一次Cron执行继续尝试
            await supabase
              .from('image_tasks')
              .update({
                status: 'pending',
                error_message: `尝试失败(${(task.attempt_count || 0) + 1}/${MAX_RETRY_COUNT}): ${error instanceof Error ? error.message : String(error)}`,
                updated_at: new Date().toISOString()
              })
              .eq('id', task.id);
          }
          
          return { taskId: task.id, success: false, error: error instanceof Error ? error.message : String(error) };
        }
      })
    );
    
    // 处理超时任务
    const { data: timeoutTasks, error: timeoutError } = await supabase
      .from('image_tasks')
      .select('id')
      .in('status', ['pending', 'processing'])
      .lt('created_at', timeoutTimestamp)
      .limit(20);
    
    if (!timeoutError && timeoutTasks && timeoutTasks.length > 0) {
      logger.info(`标记 ${timeoutTasks.length} 个超时任务为失败`);
      
      await supabase
        .from('image_tasks')
        .update({
          status: 'failed',
          error_message: `任务超时(${TASK_TIMEOUT_MINUTES}分钟)`,
          updated_at: new Date().toISOString()
        })
        .in('id', timeoutTasks.map(task => task.id));
    }
    
    // 返回处理结果
    return NextResponse.json({
      processed: pendingTasks.length,
      results: processResults,
      timedOut: timeoutTasks?.length || 0
    });
    
  } catch (error) {
    logger.error(`Cron任务执行失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: 'Cron任务执行失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 