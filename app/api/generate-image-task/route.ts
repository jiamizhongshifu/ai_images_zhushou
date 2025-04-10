import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getApiConfig } from '@/utils/env';
import { v4 as uuid } from 'uuid';
import { OpenAI } from 'openai';
import { updateCredits } from '@/utils/credit-service';
import { estimateBase64Size } from '@/utils/image/image2Base64';

// 图片大小限制
const MAX_REQUEST_SIZE_MB = 12; // 12MB
const MAX_IMAGE_SIZE_MB = 8;    // 8MB
const MB_TO_BYTES = 1024 * 1024;

// 预处理请求，检查请求大小
async function checkRequestSize(request: NextRequest): Promise<{isValid: boolean, error?: string}> {
  try {
    // 获取Content-Length头
    const contentLength = request.headers.get('Content-Length');
    
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / MB_TO_BYTES;
      
      if (sizeInMB > MAX_REQUEST_SIZE_MB) {
        console.error(`请求体过大: ${sizeInMB.toFixed(2)}MB，超过限制(${MAX_REQUEST_SIZE_MB}MB)`);
        return {
          isValid: false,
          error: `请求体过大(${sizeInMB.toFixed(1)}MB)，超过限制(${MAX_REQUEST_SIZE_MB}MB)，请减小图片尺寸或降低质量`
        };
      }
    }
    
    return { isValid: true };
  } catch (error) {
    console.error('检查请求大小出错:', error);
    return { isValid: true }; // 出错时放行，由后续步骤处理
  }
}

// 检查图片大小
function checkImageSize(imageBase64: string): {isValid: boolean, error?: string} {
  try {
    // 计算图片大小
    const sizeKB = estimateBase64Size(imageBase64);
    const sizeInMB = sizeKB / 1024;
    
    if (sizeInMB > MAX_IMAGE_SIZE_MB) {
      console.error(`图片过大: ${sizeInMB.toFixed(2)}MB，超过限制(${MAX_IMAGE_SIZE_MB}MB)`);
      return {
        isValid: false,
        error: `图片过大(${sizeInMB.toFixed(1)}MB)，超过限制(${MAX_IMAGE_SIZE_MB}MB)，请减小图片尺寸或降低质量`
      };
    }
    
    return { isValid: true };
  } catch (error) {
    console.error('检查图片大小出错:', error);
    return { isValid: true }; // 出错时放行，由后续步骤处理
  }
}

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

// 保存生成历史到数据库
async function saveGenerationHistory(
  supabase: any, 
  userId: string, 
  imageUrl: string, 
  prompt: string, 
  style?: string | null, 
  aspectRatio?: string | null,
  standardAspectRatio?: string | null
) {
  try {
    // 保存到历史记录表
    const { error } = await supabase
      .from('ai_images_creator_history')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        prompt: prompt,
        style: style,
        aspect_ratio: aspectRatio,
        standard_aspect_ratio: standardAspectRatio,
        model_used: process.env.TUZI_MODEL || 'default-model',
        status: 'completed',
        created_at: new Date().toISOString()
      });
      
    if (error) {
      logger.error(`保存生成历史失败: ${error.message}`);
      return false;
    }
    
    logger.info(`成功保存图片生成历史记录`);
    return true;
  } catch (err) {
    logger.error(`保存历史记录出错: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// 从聊天内容中提取图片URL
function extractImageUrl(content: string): string | null {
  // 尝试提取URL
  const urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(jpe?g|png|gif|webp|bmp))/i) || 
                   content.match(/(https?:\/\/[^\s"'<>]+)/i);
  
  if (urlMatch && urlMatch[1]) {
    logger.debug(`从内容中提取到URL: ${urlMatch[1]}`);
    return urlMatch[1];
  }
  
  return null;
}

// 进行点数更新，并发送事件
const notifyCreditsUpdate = async (userId: string, newCredits: number) => {
  try {
    // 使用点数服务的updateCredits通知前端刷新
    updateCredits(newCredits);
    logger.info(`已触发点数更新事件, 用户: ${userId}, 新点数: ${newCredits}`);
    
    // 创建重试机制，确保事件能够正确发送
    let retryCount = 0;
    const maxRetries = 3;
    const retryInterval = 1000; // 1秒
    
    const retryUpdateCredits = () => {
      setTimeout(() => {
        try {
          updateCredits(newCredits);
          logger.info(`重试触发点数更新事件 #${retryCount+1}, 用户: ${userId}, 新点数: ${newCredits}`);
        } catch (retryError) {
          logger.error(`重试触发点数更新事件失败 #${retryCount+1}: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
          retryCount++;
          if (retryCount < maxRetries) {
            retryUpdateCredits();
          }
        }
      }, retryInterval * (retryCount + 1));
    };
    
    // 添加一次延迟重试，确保前端有足够时间处理事件
    retryUpdateCredits();
    
  } catch (eventError) {
    logger.error(`触发点数更新事件失败: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
  }
};

export async function POST(request: NextRequest) {
  try {
    // 预检查请求大小
    const sizeCheck = await checkRequestSize(request);
    if (!sizeCheck.isValid) {
      return NextResponse.json({ 
        status: 'failed',
        error: sizeCheck.error,
        suggestion: '请使用较小的图片或降低图片质量后重试'
      }, { status: 413 });
    }
    
    // 解析请求体
    const body = await request.json().catch((error) => {
      console.error('解析请求JSON失败:', error);
      throw new Error('无效的请求格式，无法解析JSON数据');
    });
    
    const { prompt, image, style } = body;
    
    // 验证必要参数
    if (!prompt && !image) {
      return NextResponse.json({
        status: 'failed',
        error: '提示词和图片至少需要提供一项'
      }, { status: 400 });
    }
    
    // 检查图片大小
    if (image) {
      const imageCheck = checkImageSize(image);
      if (!imageCheck.isValid) {
        return NextResponse.json({
          status: 'failed',
          error: imageCheck.error,
          suggestion: '请使用较小的图片或降低图片质量后重试'
        }, { status: 413 });
      }
    }
    
    // 验证用户身份
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('未授权访问，无法获取用户信息:', authError?.message);
      return NextResponse.json({
        status: 'failed',
        error: '请先登录再进行图片生成',
        code: 'auth_required'
      }, { status: 401 });
    }
    
    // 检查用户点数
    const { data: credits, error: creditsError } = await supabase
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', user.id)
      .single();
    
    // 错误处理 - 查询点数失败
    if (creditsError) {
      console.error('获取用户点数失败:', creditsError.message);
      return NextResponse.json({
        status: 'failed',
        error: '无法获取用户点数信息',
        suggestion: '请刷新页面或重新登录后再试'
      }, { status: 500 });
    }
    
    // 检查用户点数是否足够
    if (!credits || credits.credits < 1) {
      return NextResponse.json({
        status: 'failed',
        error: '点数不足，无法生成图片',
        code: 'insufficient_credits',
        suggestion: '请充值点数后再试'
      }, { status: 402 });
    }
    
    // 生成任务ID
    const taskId = uuid();
    
    // 在数据库中创建任务记录
    const supabaseAdmin = await createAdminClient();
    
    try {
      // 扣除用户1点积分
      const { error: updateError } = await supabaseAdmin
        .from('ai_images_creator_credits')
        .update({
          credits: credits.credits - 1,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);
      
      if (updateError) {
        console.error('扣除用户点数失败:', updateError.message);
        throw new Error('扣除用户点数失败');
      }
      
      // 创建任务记录
      const { error: taskError } = await supabaseAdmin
        .from('ai_images_creator_tasks')
        .insert({
          user_id: user.id,
          task_id: taskId,
          status: 'pending',
          prompt: prompt,
          image_base64: image || null,
          style: style || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (taskError) {
        console.error('创建任务记录失败:', taskError.message);
        throw new Error('创建任务记录失败');
      }
    } catch (error) {
      // 错误处理 - 回滚点数
      console.error('创建任务失败，尝试回滚点数:', error);
      
      try {
        // 尝试恢复用户点数
        await supabaseAdmin
          .from('ai_images_creator_credits')
          .update({
            credits: credits.credits,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
          
        console.log('成功回滚用户点数');
      } catch (rollbackError) {
        console.error('回滚用户点数失败:', rollbackError);
      }
      
      // 返回错误响应
      return NextResponse.json({
        status: 'failed',
        error: '创建图像任务失败',
        details: error instanceof Error ? error.message : String(error)
      }, { status: 500 });
    }
    
    // 不等待生成完成，直接返回任务ID
    return NextResponse.json({ 
      taskId, 
      status: 'processing',
      message: '图像正在生成中，请稍后查询结果' 
    });
    
  } catch (error) {
    console.error(`处理图像生成请求失败:`, error);
    
    // 判断错误类型，提供更友好的错误信息
    let status = 500;
    let errorMessage = '创建图像任务失败';
    let suggestion = '请稍后重试';
    
    if (error instanceof Error) {
      if (error.message.includes('JSON')) {
        status = 400;
        errorMessage = '无效的请求格式';
        suggestion = '请确保发送的是有效的JSON数据';
      } else if (error.message.includes('点数')) {
        status = 402;
        errorMessage = error.message;
        suggestion = '请充值点数或联系客服';
      } else if (error.message.includes('大小') || error.message.includes('尺寸')) {
        status = 413;
        errorMessage = error.message;
        suggestion = '请减小图片尺寸或降低质量后重试';
      }
    }
    
    return NextResponse.json(
      { 
        status: 'failed',
        error: errorMessage, 
        suggestion,
        details: error instanceof Error ? error.message : String(error) 
      },
      { status }
    );
  }
} 