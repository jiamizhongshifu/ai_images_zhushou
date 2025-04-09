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
      status: 'processing', // 直接设为处理中
      created_at: now,
      updated_at: now,
      provider: 'tuzi',
      model,
      attempt_count: 1
    });
    
    logger.info(`创建图像任务: ${taskId}, 用户: ${user.id}, 提示词: ${prompt}`);
    
    // 创建一个Promise，但不等待它完成
    // 这样API可以快速返回，同时任务继续在后台处理
    const generatePromise = (async () => {
      try {
        const tuziClient = createTuziClient();
        
        // 调用图像生成API
        const response = await tuziClient.images.generate({
          prompt,
          model,
          response_format: 'url',
          user: `task_${taskId}`
        });
        
        // 处理成功响应
        if (response && response.data && response.data[0]?.url) {
          logger.info(`任务 ${taskId} 图像生成成功, 更新状态`);
          
          // 更新任务状态为完成
          await supabase.from('image_tasks').update({
            status: 'completed',
            image_url: response.data[0].url,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }).eq('id', taskId);
        } else {
          throw new Error('API未返回有效的图像URL');
        }
      } catch (error) {
        logger.error(`任务 ${taskId} 图像生成失败: ${error instanceof Error ? error.message : String(error)}`);
        
        // 更新任务状态为失败
        await supabase.from('image_tasks').update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString()
        }).eq('id', taskId);
      }
    })();
    
    // 不等待生成完成，直接返回任务ID
    return NextResponse.json({ 
      taskId, 
      status: 'processing',
      message: '图像正在生成中，请稍后查询结果' 
    });
    
  } catch (error) {
    logger.error(`处理图像生成请求失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: '创建图像任务失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 