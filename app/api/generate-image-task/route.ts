import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getApiConfig } from '@/utils/env';
import { v4 as uuid } from 'uuid';
import { OpenAI } from 'openai';

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
    console.error(`[图片任务错误] ${message}`);
  },
  info: (message: string) => {
    console.log(`[图片任务] ${message}`);
  },
  debug: (message: string) => {
    console.log(`[图片任务调试] ${message}`);
  }
};

// 创建图资API客户端 - 按照tuzi-openai.md的方式
function createTuziClient() {
  // 获取环境配置
  const apiConfig = getApiConfig('tuzi') as TuziConfig;
  
  // 优先使用环境变量中的配置
  const apiKey = apiConfig.apiKey || process.env.TUZI_API_KEY;
  const baseURL = apiConfig.apiUrl || process.env.TUZI_BASE_URL || "https://api.tu-zi.com/v1";
  
  logger.info(`创建图资API客户端，使用BASE URL: ${baseURL}`);
  
  // 返回配置的客户端 - 使用图资API
  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  });
}

export async function POST(request: NextRequest) {
  try {
    // 获取用户ID和请求数据
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: '未授权访问' },
        { status: 401 }
      );
    }
    
    // 解析请求数据
    const requestData = await request.json();
    const { 
      prompt,
      style = null,
      aspectRatio = null
    } = requestData;
    
    // 验证提示词
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: '提示词不能为空' },
        { status: 400 }
      );
    }
    
    // 创建任务ID
    const taskId = uuid();
    const now = new Date().toISOString();
    
    // 获取Tuzi模型
    const apiConfig = getApiConfig('tuzi') as TuziConfig;
    const model = apiConfig.model || process.env.TUZI_MODEL || 'default-model';
    
    // 创建任务记录
    await supabase.from('image_tasks').insert({
      id: taskId,
      user_id: user.id,
      prompt,
      style,
      aspect_ratio: aspectRatio,
      status: 'pending',
      created_at: now,
      updated_at: now,
      provider: 'tuzi',
      model,
      attempt_count: 0
    });
    
    logger.info(`创建图像任务: ${taskId}, 用户: ${user.id}, 提示词: ${prompt}`);
    
    // 尝试立即启动生成(如果API响应较快，可能直接完成)
    try {
      const tuziClient = createTuziClient();
      // 非阻塞调用API，不等待结果
      tuziClient.images.generate({
        prompt,
        model,
        response_format: 'url',
        // 可以添加唯一标识符用于后续查询
        user: `task_${taskId}`
      }).then(async (result) => {
        // 异步处理结果，不会阻塞当前请求
        if (result && result.data && result.data[0]?.url) {
          logger.info(`任务 ${taskId} 已完成，更新数据库`);
          await supabase.from('image_tasks').update({
            status: 'completed',
            image_url: result.data[0].url,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }).eq('id', taskId);
        }
      }).catch(async (error) => {
        logger.error(`任务 ${taskId} 立即执行失败: ${error.message}`);
        await supabase.from('image_tasks').update({
          status: 'failed',
          error_message: `初始尝试失败: ${error.message}`,
          updated_at: new Date().toISOString()
        }).eq('id', taskId);
      });
    } catch (error) {
      logger.error(`启动任务 ${taskId} 失败: ${error instanceof Error ? error.message : String(error)}`);
      // 不抛出错误，让Cron任务稍后重试
    }
    
    // 立即返回任务ID
    return NextResponse.json({ 
      taskId, 
      status: 'pending',
      message: '图像生成任务已创建，请稍后查询结果' 
    });
    
  } catch (error) {
    logger.error(`处理图像生成请求失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: '创建图像任务失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 