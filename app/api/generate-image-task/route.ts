import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { v4 as uuid } from 'uuid';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getApiConfig } from '@/utils/env';
import { updateCredits } from '@/utils/credit-service';
import { estimateBase64Size } from '@/utils/image/image2Base64';
import { cookies } from 'next/headers';
import { createSecureClient, getCurrentUser } from '@/app/api/auth-middleware';
import { ChatCompletionMessageParam, ChatCompletionContentPart } from 'openai/resources';
import { ChatCompletionUserMessageParam, ChatCompletionSystemMessageParam } from 'openai/resources/chat/completions';

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
          error: `请求体过大(${sizeInMB.toFixed(1)}MB)，超过限制(${MAX_REQUEST_SIZE_MB}MB)，请减小图片尺寸或降低质量后重试`
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
        error: `图片过大(${sizeInMB.toFixed(1)}MB)，超过限制(${MAX_IMAGE_SIZE_MB}MB)，请减小图片尺寸或降低质量后重试`
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
  debug: (message: string) => {
    console.debug(`[图片任务调试] ${message}`);
  },
  info: (message: string) => {
    console.log(`[图片任务] ${message}`);
  },
  warn: (message: string) => {
    console.warn(`[图片任务警告] ${message}`);
  },
  error: (message: string) => {
    console.error(`[图片任务错误] ${message}`);
  },
  // 增加性能计时日志
  timing: (startTime: number, label: string) => {
    const duration = Date.now() - startTime;
    console.log(`[图片任务计时] ${label}: ${duration}ms`);
  },
  // 增加任务状态转换日志
  stateChange: (taskId: string, fromState: string, toState: string) => {
    console.log(`[图片任务状态] 任务${taskId}状态从${fromState}变更为${toState}`);
  }
};

// 创建图资API客户端 - 按照tuzi-openai.md的方式
function createTuziClient() {
  // 获取环境配置
  const apiConfig = getApiConfig('tuzi') as TuziConfig;
  
  // 优先使用环境变量中的配置
  const apiKey = apiConfig.apiKey || process.env.OPENAI_API_KEY;
  const baseURL = apiConfig.apiUrl || process.env.OPENAI_BASE_URL || "https://api.tu-zi.com/v1";
  
  // 设置gpt-4o-all作为默认模型
  let imageModel = "gpt-4o-all"; 
  
  // 记录环境变量配置情况，但始终使用gpt-4o-all
  if (process.env.OPENAI_IMAGE_MODEL) {
    logger.info(`环境变量中配置的模型: ${process.env.OPENAI_IMAGE_MODEL}，但将使用gpt-4o-all`);
  } else {
    logger.info(`未找到OPENAI_IMAGE_MODEL环境变量，将使用gpt-4o-all`);
  }
  
  logger.info(`创建图资API客户端，使用BASE URL: ${baseURL}`);
  logger.debug(`API密钥状态: ${apiKey ? '已配置' : '未配置'} (长度: ${apiKey?.length || 0})`);
  logger.debug(`使用统一图像生成模型: ${imageModel}`);
  
  if (!apiKey) {
    logger.error('API密钥未配置，请检查环境变量OPENAI_API_KEY');
    throw new Error('API密钥未配置');
  }
  
  // 返回配置的客户端以及模型配置
  return {
    client: new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
    }),
    imageModel: imageModel
  };
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
    // 检查表结构是否包含provider字段
    logger.debug(`准备保存历史记录，先检查表结构`);
    
    // 首先查询表结构
    const { data: tableInfo, error: tableError } = await supabase
      .from('ai_images_creator_history')
      .select('*')
      .limit(1);
    
    if (tableError) {
      logger.warn(`检查表结构失败: ${tableError.message}`);
    }
    
    // 始终使用gpt-4o-all作为模型名称
    const modelUsed = 'gpt-4o-all';
    
    // 构建基本数据对象
    const historyData: any = {
        user_id: userId,
        image_url: imageUrl,
      prompt: prompt || '',
      style: style || null,
      aspect_ratio: aspectRatio || null,
      standard_aspect_ratio: standardAspectRatio || null,
      model_used: modelUsed,
        status: 'completed',
        created_at: new Date().toISOString()
    };
    
    // 检查表结构，判断是否包含provider字段
    let hasProviderField = true;
    
    if (!tableError && tableInfo && tableInfo.length > 0) {
      const columns = Object.keys(tableInfo[0]);
      hasProviderField = columns.includes('provider');
      logger.debug(`表结构检查结果: provider字段${hasProviderField ? '存在' : '不存在'}`);
    }
    
    // 仅当确认有provider字段时添加
    if (hasProviderField) {
      historyData.provider = 'tuzi';
    }
    
    // 保存到历史记录表
    logger.debug(`开始插入历史记录，数据: ${JSON.stringify(historyData)}`);
    const { error } = await supabase
      .from('ai_images_creator_history')
      .insert([historyData]);
      
    if (error) {
      logger.error(`保存生成历史失败: ${error.message}`);
      
      // 如果错误与provider字段有关，尝试移除此字段后重新插入
      if (error.message.toLowerCase().includes('provider')) {
        logger.info(`检测到provider字段问题，尝试移除此字段后重新插入`);
        delete historyData.provider;
        
        const { error: retryError } = await supabase
          .from('ai_images_creator_history')
          .insert([historyData]);
          
        if (retryError) {
          logger.error(`移除provider字段后仍插入失败: ${retryError.message}`);
          return false;
        } else {
          logger.info(`移除provider字段后成功保存历史记录`);
          return true;
        }
      }
      
      return false;
    }
    
    logger.info(`成功保存图片生成历史记录`);
    return true;
  } catch (err) {
    logger.error(`保存历史记录出错: ${err instanceof Error ? err.message : String(err)}`);
    // 即使保存失败也不应阻止主流程
    return false;
  }
}

// 从聊天内容中提取图片URL
function extractImageUrl(content: string): string | null {
  // 记录完整内容用于调试
  logger.debug(`尝试从内容中提取URL: ${content.substring(0, 300)}...`);
  
  // 尝试提取各种格式的图片URL
  const patterns = [
    // 常规图片URL
    /(https?:\/\/[^\s"'<>]+\.(jpe?g|png|gif|webp|bmp))/i,
    // 通用URL，可能是图片服务
    /(https?:\/\/[^\s"'<>]+\/[^\s"'<>]+\.(jpe?g|png|gif|webp|bmp))/i,
    // 带图片参数的URL
    /(https?:\/\/[^\s"'<>]+\?.*image.*=.*)/i,
    // Markdown图片链接
    /!\[.*?\]\((https?:\/\/[^\s)]+)\)/i,
    // HTML图片标签
    /<img.*?src=["'](https?:\/\/[^\s"'<>]+)["']/i,
    // 任何URL (最后尝试)
    /(https?:\/\/[^\s"'<>]+)/i
  ];
  
  // 逐个尝试各种模式
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      logger.debug(`从内容中使用模式 ${pattern} 提取到URL: ${match[1]}`);
      return match[1];
    }
  }
  
  logger.error(`未能提取到任何URL，原内容: ${content}`);
  return null;
}

// 进行点数更新，并发送事件
const notifyCreditsUpdate = async (userId: string, newCredits: number) => {
  try {
    // 使用点数服务的updateCredits通知前端
    updateCredits(newCredits);
    logger.info(`已触发点数更新事件, 用户: ${userId}, 新点数: ${newCredits}`);
    
    // 只进行一次延迟重试，不再使用多次重试机制
      setTimeout(() => {
        try {
          updateCredits(newCredits);
        logger.info(`重试触发点数更新事件, 用户: ${userId}, 新点数: ${newCredits}`);
        } catch (retryError) {
        logger.error(`重试触发点数更新事件失败: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
      }
    }, 2000); // 延迟2秒进行单次重试
    
  } catch (eventError) {
    logger.error(`触发点数更新事件失败: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
  }
};

// 验证图片数据格式
function validateImageData(imageData: string): boolean {
  try {
    // 基本格式检查
    if (!imageData || typeof imageData !== 'string') {
      logger.error('图片数据无效：为空或非字符串');
      return false;
    }
    
    // 检查前缀 - 更宽松的验证
    if (!imageData.startsWith('data:image/')) {
      logger.warn('图片数据缺少有效的data:image前缀，尝试自动修复');
      return true; // 返回true以允许代码尝试添加前缀
    }

    // 验证base64部分 - 更简单的验证
    const parts = imageData.split(',');
    if (parts.length < 2) {
      logger.warn('图片数据格式可能有问题，未找到标准base64分隔符');
      // 尝试提取可能的base64部分
      const possibleBase64 = imageData.replace(/^data:image\/[^;]+;base64,/, '');
      try {
        // 尝试解码一小部分看是否是有效base64
        const testBuffer = Buffer.from(possibleBase64.substring(0, 100), 'base64');
        if (testBuffer.length > 0) {
          logger.info('检测到非标准但可能有效的base64数据');
          return true;
        }
      } catch (e) {
        logger.error('解析可能的base64部分失败');
      }
      return false;
    }
    
    // 数据检查 - 简化验证
    try {
      const base64Part = parts[1].trim();
      if (!base64Part) {
        logger.error('base64部分为空');
        return false;
      }
      
      // 快速检查base64格式有效性 - 只解码前1KB进行测试
      const testPart = base64Part.substring(0, 1024);
      const buffer = Buffer.from(testPart, 'base64');
      
      logger.info(`图片数据有效，前1KB解码后大小: ${buffer.length}字节`);
      return true;
    } catch (decodeError) {
      logger.error(`解码图片数据出错: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`);
      return false;
    }
  } catch (error) {
    logger.error(`验证图片数据时出现未预期错误: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// 带重试的数据库操作
async function retryDatabaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // 只有在不是最后一次尝试时才延迟和重试
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        logger.warn(`数据库操作失败，等待${delay}ms后重试(${attempt + 1}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // 所有重试都失败
  throw lastError;
}

// 增强错误记录函数，提供详细的错误信息
function logEnhancedError(context: string, error: any, taskId?: string) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const errorType = error instanceof Error ? error.constructor.name : 'Unknown';
  const errorStack = error instanceof Error ? error.stack : 'No stack trace';
  
  console.error(`[错误记录增强] ${context}:`);
  console.error(`- 任务ID: ${taskId || 'N/A'}`);
  console.error(`- 错误类型: ${errorType}`);
  console.error(`- 错误消息: ${errorMsg}`);
  console.error(`- 时间戳: ${new Date().toISOString()}`);
  console.error(`- 堆栈跟踪: ${errorStack || 'No stack trace'}`);
  
  // 记录错误到单独的日志文件或服务
  try {
    // 添加额外上下文信息
    const diagnosticInfo = {
      timestamp: new Date().toISOString(),
      taskId,
      errorType,
      errorMessage: errorMsg,
      stackTrace: errorStack,
      context,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        openaiModel: process.env.OPENAI_IMAGE_MODEL,
        baseUrl: (process.env.OPENAI_BASE_URL || '').replace(/\/v1\/?$/, '') // 移除可能的API版本
      }
    };
    
    // 在开发环境中打印完整诊断信息
    if (process.env.NODE_ENV === 'development') {
      console.log('详细诊断信息:', JSON.stringify(diagnosticInfo, null, 2));
    }
    
    // 这里可以添加发送到错误监控服务的代码
    // 例如Sentry、LogRocket等
  } catch (loggingError) {
    console.error('记录增强错误信息失败:', loggingError);
  }
  
  return errorMsg; // 返回原始错误消息，便于后续处理
}

// 添加任务通知函数
async function notifyTaskUpdate(taskId: string, status: string, imageUrl?: string, error?: string) {
  try {
    // 尝试调用内部API触发通知
    const notifyResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/notify-task-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET || ''}` // 使用内部API密钥
      },
      body: JSON.stringify({
        taskId,
        status,
        imageUrl,
        error,
        timestamp: new Date().toISOString()
      })
    });
    
    if (notifyResponse.ok) {
      logger.info(`已成功触发任务${taskId}的${status}通知`);
      return true;
    } else {
      const errorText = await notifyResponse.text();
      logger.error(`触发任务通知失败: ${errorText}`);
      return false;
    }
  } catch (error) {
    logger.error(`发送任务通知异常: ${error instanceof Error ? error.message : String(error)}`);
    // 尝试备用通知方法 - 直接插入数据库记录
    try {
      const supabaseAdmin = await createAdminClient();
      await supabaseAdmin
        .from('task_status_updates')
        .insert({
          task_id: taskId,
          status: status,
          image_url: imageUrl || null,
          error_message: error || null,
          created_at: new Date().toISOString()
        });
      logger.info(`使用备用方法记录任务${taskId}的${status}通知`);
      return true;
    } catch (dbError) {
      logger.error(`备用通知方法也失败: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      return false;
    }
  }
}

// 创建图像URL验证函数
function isValidImageUrl(url: string): boolean {
  // 验证URL格式
  try {
    new URL(url);
    return url.startsWith('http') && 
           /\.(jpe?g|png|gif|webp|svg)($|\?)/i.test(url) ||
           /\/images?\//i.test(url) ||
           /\/(image|picture|photo|file|generated-image)/i.test(url);
  } catch (e) {
    return false;
  }
}

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
    
    const { prompt, image, style, aspectRatio, standardAspectRatio } = body;
    
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
    
    // 验证用户身份 - 使用更可靠的认证方法
    logger.debug('开始验证用户身份...');
    
    // 使用安全客户端获取用户信息
    const { supabase } = await createSecureClient();
    const currentUser = await getCurrentUser(supabase);
    
    if (!currentUser) {
      logger.error('未找到用户信息，认证失败');
      return NextResponse.json({
        status: 'failed',
        error: '认证失败，请重新登录',
        code: 'auth_required'
      }, { status: 401 });
    }
    
    logger.info(`用户 ${currentUser.id} 认证成功`);
    
    // 检查用户点数
    const { data: credits, error: creditsError } = await supabase
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', currentUser.id)
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
        .eq('user_id', currentUser.id);
      
      if (updateError) {
        console.error('扣除用户点数失败:', updateError.message);
        throw new Error('扣除用户点数失败');
      }
      
      // 创建任务记录
      const taskUUID = uuid();
      const { error: taskError } = await supabaseAdmin
        .from('image_tasks')
        .insert({
          id: taskUUID,
          user_id: currentUser.id,
          task_id: taskId,
          status: 'pending',
          prompt: prompt,
          image_base64: image || null,
          style: style || null,
          provider: 'tuzi',
          model: 'gpt-4o-all',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (taskError) {
        console.error('创建任务记录失败:', taskError.message);
        throw new Error(`创建任务记录失败: ${taskError.message}`);
      }
      
      // 验证任务是否正确创建
      const { data: createdTask, error: checkTaskError } = await supabaseAdmin
        .from('image_tasks')
        .select('*')
        .eq('task_id', taskId)
        .single();
        
      if (checkTaskError || !createdTask) {
        console.error('验证任务创建失败:', checkTaskError?.message || '未找到任务记录');
        throw new Error(`任务验证失败: ${checkTaskError?.message || '未找到任务记录'}`);
      }
      
      logger.info(`成功创建并验证任务，ID: ${taskId}, UUID: ${taskUUID}`);
      
      // 直接进行图像生成 - 不等待异步过程
      try {
        // 创建OpenAI客户端
        const { client: openaiClient, imageModel } = createTuziClient();
        
        // 记录开始时间
        const startTime = Date.now();
        logger.info(`开始处理图像，任务ID: ${taskId}，使用模型: ${imageModel}`);
        logger.debug(`环境变量OPENAI_IMAGE_MODEL: ${process.env.OPENAI_IMAGE_MODEL || '未设置'}`);
        logger.debug(`环境变量OPENAI_MODEL: ${process.env.OPENAI_MODEL || '未设置'}`);
        
        // 创建API请求
        let response, imageUrl;
        
        // 更新任务状态为处理中
        try {
          await retryDatabaseOperation(async () => {
            // 先检查任务是否存在
            const { data: taskToUpdate, error: findTaskError } = await supabaseAdmin
              .from('image_tasks')
              .select('id, status, attempt_count')
              .eq('task_id', taskId)
              .single();
              
            if (findTaskError || !taskToUpdate) {
              logger.error(`找不到要更新的任务: ${findTaskError?.message || '未找到记录'}`);
              throw new Error(`任务${taskId}不存在，无法更新状态`);
            }
            
            if (taskToUpdate.status === 'processing') {
              logger.info(`任务已处于处理中状态，无需更新，任务ID: ${taskId}`);
            } else {
              const { error: updateStatusError } = await supabaseAdmin
                .from('image_tasks')
                .update({
                  status: 'processing',
                  updated_at: new Date().toISOString()
                })
                .eq('task_id', taskId);
                
              if (updateStatusError) {
                logger.error(`更新任务状态为处理中失败: ${updateStatusError.message}`);
                throw updateStatusError;
              } else {
                logger.stateChange(taskId, taskToUpdate.status, 'processing');
                logger.info(`已将任务状态从${taskToUpdate.status}更新为processing，任务ID: ${taskId}`);
              }
            }
            
            return true;
          });
        } catch (statusUpdateError) {
          logger.error(`更新任务状态异常: ${statusUpdateError instanceof Error ? statusUpdateError.message : String(statusUpdateError)}`);
          // 继续执行，不中断流程
        }
        
        // 用于记录提示词的变量
        let finalPrompt = "";
        // 定义单一消息结构
        const messages: ChatCompletionMessageParam[] = [];
        
        // 获取图片尺寸比例参数
        let size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024"; // 默认尺寸
        let aspectRatioDescription = ""; // 比例描述文本
        
        // 根据请求参数和提示词确定合适的尺寸
        if (aspectRatio) {
          // 添加比例描述到提示词中
          aspectRatioDescription = `，保持${aspectRatio}的宽高比例`;
          
          // 根据实际图片比例决定输出尺寸
          logger.info(`检测到图片比例: ${aspectRatio}`);
          
          if (standardAspectRatio) {
            logger.info(`标准化比例: ${standardAspectRatio}`);
            
            // 根据标准化比例选择合适的DALL-E尺寸
            if (standardAspectRatio.includes('16:9') || standardAspectRatio.includes('4:3') || standardAspectRatio.includes('3:2')) {
              size = "1792x1024"; // 宽屏比例
              logger.info(`根据图片比例选择宽屏尺寸: ${size}`);
            } else if (standardAspectRatio.includes('9:16') || standardAspectRatio.includes('3:4') || standardAspectRatio.includes('2:3')) {
              size = "1024x1792"; // 高屏比例
              logger.info(`根据图片比例选择竖屏尺寸: ${size}`);
            } else {
              logger.info(`根据图片比例选择标准尺寸: ${size}`);
            }
          } else {
            // 尝试从原始比例中提取信息
            const parts = aspectRatio.split(':');
            if (parts.length === 2) {
              const width = parseFloat(parts[0]);
              const height = parseFloat(parts[1]);
              if (!isNaN(width) && !isNaN(height)) {
                const ratio = width / height;
                if (ratio > 1.2) {
                  size = "1792x1024"; // 宽屏比例
                  logger.info(`根据原始比例(${ratio.toFixed(2)})选择宽屏尺寸: ${size}`);
                } else if (ratio < 0.8) {
                  size = "1024x1792"; // 高屏比例
                  logger.info(`根据原始比例(${ratio.toFixed(2)})选择竖屏尺寸: ${size}`);
                } else {
                  logger.info(`根据原始比例(${ratio.toFixed(2)})选择标准尺寸: ${size}`);
                }
              }
            }
          }
        }
        // 如果未能从图片比例确定尺寸，再根据风格和提示词确定
        else if (style && style.includes('wide') || finalPrompt.includes('landscape') || finalPrompt.includes('panorama')) {
          size = "1792x1024"; // 宽屏比例
          logger.info(`使用宽屏尺寸: ${size}`);
        } else if (style && style.includes('tall') || finalPrompt.includes('portrait') || finalPrompt.includes('vertical')) {
          size = "1024x1792"; // 高屏比例
          logger.info(`使用竖屏尺寸: ${size}`);
        } else {
          logger.info(`使用标准尺寸: ${size}`);
        }
        
        // 记录比例信息
        if (aspectRatio) {
          logger.info(`图片比例参数: aspectRatio=${aspectRatio}, standardAspectRatio=${standardAspectRatio || '未指定'}`);
        }

        // 只添加一条消息，包含所有内容
        if (image) {
          logger.info(`处理用户上传的图片，任务ID: ${taskId}`);
          
          try {
            // 增强日志记录，确认图片传递情况
            logger.debug(`图片数据长度: ${image.length}`);
            logger.debug(`图片数据前100字符: ${image.substring(0, 100)}...`);
            logger.debug(`图片数据是否以data:开头: ${image.startsWith('data:')}`);
            
            // 改进图片数据处理
            let imageData;
            if (image.startsWith('data:')) {
              imageData = image;
              logger.debug(`图片已包含data:URL前缀，无需添加`);
            } else {
              // 检查base64格式并决定合适的MIME类型
              try {
                const buffer = Buffer.from(image, 'base64');
                // 简单的图片格式检测
                let mimeType = 'image/jpeg'; // 默认JPEG
                
                // 检查常见图片格式的文件头
                if (buffer.length > 4) {
                  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
                    mimeType = 'image/jpeg';
                  } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                    mimeType = 'image/png';
                  } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
                    mimeType = 'image/gif';
                  } else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
                    mimeType = 'image/webp';
                  }
                }
                
                imageData = `data:${mimeType};base64,${image}`;
                logger.debug(`为图片添加data:URL前缀: ${mimeType}`);
                logger.debug(`图片大小: ${(buffer.length / 1024).toFixed(2)}KB`);
              } catch (error) {
                logger.warn(`处理base64图片数据时出错，使用默认JPEG类型: ${error instanceof Error ? error.message : String(error)}`);
                imageData = `data:image/jpeg;base64,${image}`;
              }
            }
            
            // 验证图片数据
            if (!validateImageData(imageData)) {
              logger.warn('图片数据格式验证失败，将使用纯文本提示');
              // 如果图片数据无效，使用纯文本提示
              let textPrompt = prompt || "";
              if (style) {
                textPrompt += textPrompt ? `，${style}风格` : `${style}风格`;
              }
              
              finalPrompt = textPrompt || "请生成一张图片";
              
              messages.push({
                role: 'user',
                content: finalPrompt
              });
            } else {
              // 组合提示词：用户输入的提示词 + 风格
              let promptText = "";
              if (prompt) {
                promptText = prompt;
              }
              
              if (style) {
                promptText += promptText ? `，${style}风格` : `${style}风格`;
              }
              
              // 如果两者都没有，使用一个基本提示
              if (!promptText) {
                promptText = "请基于这张图片生成新图片";
              }
              
              // 添加图片比例要求
              if (aspectRatio) {
                promptText += `，请严格保持${aspectRatio}的宽高比例，按照${size}尺寸生成`;
              }
              
              // 保存最终提示词，用于记录
              finalPrompt = promptText;
              
              // 创建单一消息，包含文本和图片
              const userPromptWithImage: ChatCompletionContentPart[] = [
                { 
                  type: 'text', 
                  text: promptText
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageData,
                    detail: 'high'
                  }
                }
              ];
  
              // 直接添加用户消息，不再添加额外的系统消息
              messages.push({
                role: 'user',
                content: userPromptWithImage
              } as ChatCompletionUserMessageParam);
              
              logger.debug(`添加单一消息，包含用户图片和提示词: ${promptText}`);
            }
            
            // 在创建messages后也添加日志
            logger.debug(`消息数组: ${JSON.stringify(messages).substring(0, 300)}...`);
            logger.debug(`消息数组长度: ${messages.length}，首条消息类型: ${messages[0].role}`);
            if (messages[0].content && Array.isArray(messages[0].content)) {
              logger.debug(`首条消息内容项数: ${messages[0].content.length}`);
              logger.debug(`首条消息是否包含图片: ${messages[0].content.some(item => item.type === 'image_url')}`);
            }
            
            // 跳过图片分析步骤，直接准备图像生成
            logger.info(`使用${imageModel}生成新图像，任务ID: ${taskId}`);
            
          } catch (analyzeError) {
            logger.error(`处理图片数据失败: ${analyzeError instanceof Error ? analyzeError.message : String(analyzeError)}`);
            throw new Error(`处理图片数据失败: ${analyzeError instanceof Error ? analyzeError.message : String(analyzeError)}`);
          }
        } else {
          // 没有参考图片，使用纯文本提示
          let textPrompt = prompt || "";
          if (style) {
            textPrompt += textPrompt ? `，${style}风格` : `${style}风格`;
          }
          
          // 保存最终提示词，用于记录
          finalPrompt = textPrompt || "请生成一张图片";
          
          messages.push({
            role: 'user',
            content: finalPrompt
          });
          
          logger.debug(`添加单一消息，纯文本提示: ${textPrompt}`);
        }
        
        // 图像生成参数
        const quality = "hd"; // 使用高清质量，提高输出图像质量
        const styleOption: "natural" | "vivid" = "vivid"; // 更生动的风格
        
        // 使用gpt-4o-all通过聊天API生成图像
        logger.info(`使用聊天API (gpt-4o-all)生成图片，提示词长度: ${finalPrompt.length}字符`);
        
        try {
          // 执行API调用
          logger.info(`开始调用gpt-4o-all聊天API进行图像生成`);
          logger.debug(`请求参数: 模型=gpt-4o-all, 消息数=${messages.length}, 温度=0.7`);
          
          // 确保消息内容正确传递图片数据
          if (messages.length > 0 && messages[0].content) {
            if (Array.isArray(messages[0].content)) {
              // 检查并记录图片内容
              const imageContent = messages[0].content.find(item => item.type === 'image_url');
              if (imageContent && imageContent.type === 'image_url') {
                const imgUrl = (imageContent.image_url as any).url;
                logger.debug(`消息中包含图片URL: ${imgUrl ? imgUrl.substring(0, 50) + '...' : '未找到URL'}`);
                
                // 增强图片内容验证
                const imageUrl = (imageContent.image_url as any).url;
                if (!imageUrl || !imageUrl.startsWith('data:image/')) {
                  logger.error(`图片URL格式不正确，缺少data:image/前缀: ${imageUrl?.substring(0, 30)}...`);
                  throw new Error('图片数据格式错误，请确保图片格式正确且完整');
                }
                
                // 补充图片质量信息
                if (!(imageContent.image_url as any).detail) {
                  (imageContent.image_url as any).detail = 'high';
                  logger.debug(`已添加图片质量设置: detail=high`);
                }
                
                // 验证图片数据大小
                if (imageUrl.length < 1000) {
                  logger.error(`图片数据大小异常: ${imageUrl.length} 字节`);
                  throw new Error('上传的图片数据异常，请重新上传');
                }
                
                logger.info(`图片验证成功，数据大小: ${Math.round(imageUrl.length / 1024)}KB`);
                
              } else {
                logger.warn('消息中未找到图片内容，这可能导致工具调用失败');
                logger.debug(`消息内容类型: ${messages[0].content.map(item => item.type).join(', ')}`);
              }
            }
            
            // 记录工具选择配置，确保正确设置
            logger.debug(`工具选择配置: tool_choice=auto`);
            
            // 确保第一条消息包含清晰的指令，提示模型使用图像生成功能
            if (!Array.isArray(messages[0].content) || !messages[0].content.some(item => item.type === 'text')) {
              logger.warn('消息中缺少明确的文本指令，添加默认指令');
              // 如果消息中只有图片没有文本，添加明确的文本指令
              const textContent = {
                type: 'text' as const,
                text: '请根据这张图片生成一个新的图像。' + (prompt ? `图像应当是: ${prompt}` : '')
              };
              
              if (Array.isArray(messages[0].content)) {
                // 创建新的数组，确保类型兼容
                const newContent: ChatCompletionContentPart[] = [
                  textContent, 
                  ...messages[0].content as ChatCompletionContentPart[]
                ];
                messages[0].content = newContent;
              } else {
                // 如果不是数组，设置为包含文本内容的数组
                messages[0].content = [textContent];
              }
            }
            
            logger.debug(`最终消息内容: ${JSON.stringify(messages).substring(0, 200)}...`);
          }
          
          // 添加重试逻辑，不使用降级方案
          let retryCount = 0;
          const maxRetries = 3; // 增加重试次数
          logger.info(`配置纯重试策略，固定使用gpt-4o-all模型，最大重试次数: ${maxRetries}次`);
          let chatCompletion;
          
          // 用于并发请求控制的变量
          const MAX_WAIT_TIME = 180000; // 3分钟后启动并发请求
          
          // 添加API请求开始时间记录
          const apiRequestStartTime = Date.now();
          
          while (retryCount <= maxRetries) {
            try {
              logger.info(`尝试使用gpt-4o-all模型生成图像 (尝试 ${retryCount + 1}/${maxRetries + 1})`);
              
              // 更新任务的尝试次数
              try {
                const { error: updateAttemptError } = await supabaseAdmin
                  .from('image_tasks')
                  .update({
                    attempt_count: retryCount + 1,
                    updated_at: new Date().toISOString()
                  })
                  .eq('task_id', taskId);
                
                if (updateAttemptError) {
                  logger.error(`更新任务尝试次数失败: ${updateAttemptError.message}`);
                } else {
                  logger.debug(`已更新任务尝试次数: ${retryCount + 1}`);
                }
              } catch (attemptUpdateError) {
                logger.error(`更新任务尝试次数异常: ${attemptUpdateError instanceof Error ? attemptUpdateError.message : String(attemptUpdateError)}`);
                // 继续执行，不中断流程
              }
              
              // 实现主动超时检测的请求
              const mainRequestPromise = openaiClient.chat.completions.create({
                model: 'gpt-4o-all', // 固定使用gpt-4o-all模型
                messages: messages,
                max_tokens: 1000,
                temperature: 0.7,
              });
              
              // 创建一个超时后的并发请求Promise
              let timeoutId: NodeJS.Timeout | null = null;
              let parallelRequestStarted = false;
              let parallelRequestPromise: Promise<any> | null = null;
              
              const timeoutPromise = new Promise<void>((resolve) => {
                timeoutId = setTimeout(() => {
                  logger.warn(`请求已运行${MAX_WAIT_TIME/1000}秒，启动并发请求`);
                  parallelRequestStarted = true;
                  
                  // 为并发请求设置更短的超时时间
                  const PARALLEL_TIMEOUT = 120000; // 2分钟
                  
                  // 创建并发请求的Promise和超时Promise
                  const parallelApiRequest = openaiClient.chat.completions.create({
                    model: 'gpt-4o-all',
                    messages: messages,
                    max_tokens: 1000,
                    temperature: 0.8, // 增加温度，增强差异化
                    presence_penalty: 0.1, // 添加存在惩罚，促使模型生成更多样的内容
                    frequency_penalty: 0.1, // 添加频率惩罚，减少重复
                    response_format: { type: "text" }, // 明确指定响应格式
                    tools: [],
                    tool_choice: "auto"
                  });
                  
                  // 创建并发请求的超时Promise
                  const parallelTimeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => {
                      reject(new Error(`并发请求超过${PARALLEL_TIMEOUT/1000}秒超时`));
                    }, PARALLEL_TIMEOUT);
                  });
                  
                  // 将API请求和超时Promise结合
                  parallelRequestPromise = Promise.race([
                    parallelApiRequest.then(result => {
                      logger.info(`并发请求成功完成，使用差异化参数`);
                      return result;
                    }),
                    parallelTimeoutPromise
                  ]).catch(error => {
                    logger.error(`并发请求失败: ${error instanceof Error ? error.message : String(error)}`);
                    throw error;
                  });
                  
                  resolve();
                }, MAX_WAIT_TIME);
              });
              
              // 竞争两个Promise - 使用Promise.race
              let racePromise = mainRequestPromise;
              
              // 使用Promise.race，但需要在超时后动态添加并发请求
              const monitorPromise = Promise.race([
                // 主请求
                mainRequestPromise.then(result => {
                  if (timeoutId) clearTimeout(timeoutId);
                  return { source: 'main', result };
                }).catch(error => {
                  if (timeoutId) clearTimeout(timeoutId);
                  throw { source: 'main', error };
                }),
                
                // 超时后检查并使用并发请求的结果
                timeoutPromise.then(async () => {
                  if (parallelRequestStarted && parallelRequestPromise) {
                    try {
                      const result = await parallelRequestPromise;
                      return { source: 'parallel', result };
                    } catch (error) {
                      throw { source: 'parallel', error };
                    }
                  }
                  // 如果并发请求未启动，这个Promise永远不会resolve，由主请求或错误处理
                  return new Promise(() => {});
                })
              ]);
              
              try {
                // 类型断言处理返回结果
                const response = await monitorPromise as { source: string, result: any };
                chatCompletion = response.result;
                logger.info(`${response.source}请求成功完成，使用gpt-4o-all模型生成图像`);
                logger.timing(apiRequestStartTime, `API请求完成，来源: ${response.source}`);
                
                // 增强处理成功返回的结果
                try {
                  logger.debug(`尝试解析API返回内容: ${JSON.stringify(chatCompletion).substring(0, 500)}...`);
                  
                  let imageUrl = null;
                  
                  // 尝试从响应内容中提取图片URL
                  const content = chatCompletion.choices?.[0]?.message?.content;
                  if (content && typeof content === 'string') {
                    logger.debug(`提取图片URL的内容: ${content.substring(0, 100)}...`);
                    
                    // 尝试多种方式提取URL
                    // 1. 提取markdown格式的图片链接 ![...](url)
                    const markdownPattern = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
                    const markdownMatches = Array.from(content.matchAll(markdownPattern));
                    if (markdownMatches.length > 0) {
                      imageUrl = markdownMatches[0][1];
                      logger.debug(`通过Markdown模式找到图片URL: ${imageUrl}`);
                    }
                    
                    // 如果上面失败，尝试其他格式
                    if (!imageUrl) {
                      // 直接URL链接
                      const urlPattern = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?)/g;
                      const urlMatches = Array.from(content.matchAll(urlPattern));
                      if (urlMatches.length > 0) {
                        imageUrl = urlMatches[0][1];
                        logger.debug(`通过直接URL模式找到图片URL: ${imageUrl}`);
                      }
                    }
                    
                    // 尝试HTML img标签
                    if (!imageUrl) {
                      const imgPattern = /<img.*?src=["'](https?:\/\/[^\s"']+)["']/g;
                      const imgMatches = Array.from(content.matchAll(imgPattern));
                      if (imgMatches.length > 0) {
                        imageUrl = imgMatches[0][1];
                        logger.debug(`通过HTML img标签找到图片URL: ${imageUrl}`);
                      }
                    }
                    
                    // 尝试常见的CDN链接模式
                    if (!imageUrl) {
                      const cdnPattern = /(https?:\/\/\w+\.(?:cloudfront|akamaized|staticflickr|googleusercontent)\.(?:net|com)\/[^\s]+)/g;
                      const cdnMatches = Array.from(content.matchAll(cdnPattern));
                      if (cdnMatches.length > 0) {
                        imageUrl = cdnMatches[0][1];
                        logger.debug(`通过CDN链接模式找到图片URL: ${imageUrl}`);
                      }
                    }
                  } else {
                    logger.warn(`content不存在或不是字符串`);
                  }
                  
                  // 如果从内容中提取失败，尝试从完整响应中提取
                  if (!imageUrl) {
                    // 将整个响应转为字符串并搜索URL
                    const responseStr = JSON.stringify(chatCompletion);
                    const urlRegex = /(https?:\/\/[^\s"'<>]+)/gi;
                    const allUrls = responseStr.match(urlRegex);
                    
                    if (allUrls && allUrls.length > 0) {
                      // 优先选择看起来像图片URL的链接
                      const possibleImageUrl = allUrls.find(url => 
                        url.includes('/image') || 
                        url.includes('.jpg') || 
                        url.includes('.png') || 
                        url.includes('.jpeg') || 
                        url.includes('.webp')
                      );
                      
                      imageUrl = possibleImageUrl || allUrls[0];
                      logger.info(`从完整响应中提取到可能的URL: ${imageUrl}`);
                    } else {
                      logger.error(`在完整响应中未找到任何URL`);
                    }
                  }
                  
                  // 最终处理提取到的URL
                  if (imageUrl && isValidImageUrl(imageUrl)) {
                    logger.info(`成功提取有效的图片URL: ${imageUrl}`);
                    
                    // 更新任务状态为成功
                    try {
                      const { error: updateError } = await supabaseAdmin
                        .from('image_tasks')
                        .update({
                          status: 'completed',
                          provider: 'tuzi',
                          image_url: imageUrl,
                          updated_at: new Date().toISOString()
                        })
                        .eq('task_id', taskId);
                    
                      if (updateError) {
                        logger.error(`更新任务状态失败: ${updateError.message}`);
                      } else {
                        logger.stateChange(taskId, 'processing', 'completed');
                        logger.info(`成功更新任务状态为completed, 任务ID: ${taskId}`);
                      }
                    } catch (updateError: unknown) {
                      logger.error(`更新任务状态异常: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
                    }
                    
                    // 记录到历史
                    try {
                      await saveGenerationHistory(
                        supabaseAdmin, 
                        currentUser.id, 
                        imageUrl, 
                        finalPrompt,
                        style,
                        aspectRatio,
                        standardAspectRatio
                      );
                    } catch (historyError) {
                      logger.error(`保存历史记录失败: ${historyError instanceof Error ? historyError.message : String(historyError)}`);
                    }
                    
                    // 发送任务完成通知
                    await notifyTaskUpdate(taskId, 'completed', imageUrl)
                      .catch(notifyError => 
                        logger.error(`发送任务完成通知失败: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`)
                      );
                    
                    // 完成整个过程，记录总耗时
                    logger.timing(startTime, `整个图像生成任务完成，任务ID: ${taskId}`);
                    
                    // 返回成功响应
                    return NextResponse.json({ 
                      taskId, 
                      status: 'success',
                      imageUrl: imageUrl,
                      prompt: finalPrompt,
                      style: style || null,
                      model: 'gpt-4o-all',
                      provider: 'tuzi'
                    }, { status: 200 });
                  } else {
                    // 所有方法都失败，抛出错误
                    logger.error(`所有方法都无法提取有效的图片URL`);
                    throw new Error('API返回的响应中没有包含有效的图像生成结果');
                  }
                } catch (responseProcessError) {
                  logger.error(`处理API响应时出错: ${responseProcessError instanceof Error ? responseProcessError.message : String(responseProcessError)}`);
                  throw new Error(`无法处理API响应: ${responseProcessError instanceof Error ? responseProcessError.message : String(responseProcessError)}`);
                }
                
                break; // 成功，跳出重试循环
              } catch (raceError: any) {
                // 类型断言处理错误
                const source = (raceError as { source: string }).source || 'unknown';
                const errorObj = (raceError as { error: any }).error;
                const errorMsg = errorObj instanceof Error ? errorObj.message : String(errorObj || raceError);
                logger.error(`${source}请求失败: ${errorMsg}`);
                
                // 只有当两个请求都失败时才继续重试流程
                if (!(parallelRequestStarted && parallelRequestPromise)) {
                  throw new Error(errorMsg); // 主请求失败且未启动并发请求
                }
                
                // 如果主请求失败但并发请求已启动，等待并发请求结果
                if (parallelRequestStarted && parallelRequestPromise) {
                  try {
                    chatCompletion = await parallelRequestPromise;
                    logger.info(`并发请求后续成功完成`);
                    break; // 并发请求成功，跳出重试循环
                  } catch (parallelError) {
                    const parallelErrorMsg = parallelError instanceof Error ? parallelError.message : String(parallelError);
                    logger.error(`并发请求后续失败: ${parallelErrorMsg}`);
                    throw new Error(parallelErrorMsg); // 两个请求都失败
                  }
                }
              }
            } catch (apiError) {
              const errorMsg = logEnhancedError('API调用失败', apiError, taskId);
              logger.error(`API调用失败: ${errorMsg}`);
              logger.timing(apiRequestStartTime, `API请求失败`);
              
              // 尝试发送任务状态更新通知
              await notifyTaskUpdate(taskId, 'error', undefined, errorMsg)
                .catch(notifyError => 
                  logger.error(`发送API错误通知失败: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`)
                );
              
              // 检查是否还有重试机会
              if (retryCount < maxRetries) {
                retryCount++;
                const delay = 2000 * retryCount; // 线性增加等待时间: 2秒, 4秒, 6秒...
                logger.info(`等待${delay/1000}秒后进行第${retryCount}次重试...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              
              // 如果所有重试都失败，抛出错误
              throw new Error(`图像生成失败，经过${maxRetries}次重试后依然失败: ${errorMsg}。请稍后再试或联系客服。`);
            }
          }
        } catch (generateError) {
          const detailedError = logEnhancedError('图像生成过程失败', generateError, taskId);
          logger.error(`图像生成失败: ${detailedError}`);
          
          // 尝试发送任务失败通知
          await notifyTaskUpdate(taskId, 'failed', undefined, detailedError)
            .catch(notifyError => 
              logger.error(`发送任务失败通知出错: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`)
            );
          
          // 获取当前的尝试次数
          let attemptCount = 0;
          try {
            const { data: taskData } = await supabaseAdmin
              .from('image_tasks')
              .select('attempt_count')
              .eq('task_id', taskId)
              .single();
              
            if (taskData && taskData.attempt_count !== null) {
              attemptCount = taskData.attempt_count;
            }
          } catch (fetchError: unknown) {
            logger.error(`获取任务尝试次数失败: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
          }
        
        // 更新任务状态为失败
          try {
            const { error: updateError } = await supabaseAdmin
              .from('image_tasks')
              .update({
                status: 'failed',
                provider: 'tuzi',
                error_message: detailedError,
                updated_at: new Date().toISOString()
              })
              .eq('task_id', taskId);
              
            if (updateError) {
              // 如果遇到error_details字段不存在的错误，尝试不使用该字段
              if (updateError.message.includes('error_details')) {
                logger.warn(`error_details字段可能不存在，尝试不使用该字段更新`);
        await supabaseAdmin
          .from('image_tasks')
          .update({
            status: 'failed',
                    provider: 'tuzi',
                    error_message: detailedError,
            updated_at: new Date().toISOString()
          })
          .eq('task_id', taskId);
              } else {
                logger.error(`更新任务失败状态时出错: ${updateError.message}`);
              }
            } else {
              logger.stateChange(taskId, 'processing', 'failed');
            }
          } catch (updateError: unknown) {
            logger.error(`更新任务失败状态异常: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
          }
        
        // 完成整个过程，记录总耗时
        logger.timing(startTime, `整个图像生成任务完成，任务ID: ${taskId}`);
        
        // 返回创建成功但生成失败的响应
        return NextResponse.json({ 
          taskId, 
          status: 'failed',
          error: '图像生成失败',
            details: detailedError,
            model: 'gpt-4o-all',
            provider: 'tuzi',
            suggestion: '请检查您的提示词或稍后再试，如果问题持续存在请联系客服'
        }, { status: 500 });
      }
    } catch (error) {
      // 错误处理 - 回滚点数
      console.error('创建任务失败，尝试回滚点数:', error);
      
      try {
          // 使用类型断言处理
          const creditsObject = credits as { credits: number } | null | undefined;
          
          if (!creditsObject) {
            console.log('无法回滚用户点数：credits对象为null或undefined');
          } else if (typeof creditsObject.credits === 'number') {
        await supabaseAdmin
          .from('ai_images_creator_credits')
          .update({
                credits: creditsObject.credits,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', currentUser.id);
          
        console.log('成功回滚用户点数');
          } else {
            console.log('无法回滚用户点数：credits.credits不是有效的数字');
          }
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