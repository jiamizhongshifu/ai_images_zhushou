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
  error: (message: string) => {
    console.error(`[图片任务错误] ${message}`);
  },
  info: (message: string) => {
    console.log(`[图片任务] ${message}`);
  },
  debug: (message: string) => {
    console.log(`[图片任务调试] ${message}`);
  },
  warning: (message: string) => {
    console.warn(`[图片任务警告] ${message}`);
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
      logger.warning(`检查表结构失败: ${tableError.message}`);
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
    /!\[.*?\]\((https?:\/\/[^\s)"'<>]+)\)/i,
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
    // 验证是否有data:URL前缀
    if (!imageData.startsWith('data:image/')) {
      logger.error('图片数据缺少有效的data:image前缀');
      return false;
    }

    // 验证base64部分
    const parts = imageData.split(',');
    if (parts.length !== 2) {
      logger.error('图片数据格式无效，未找到base64分隔符');
      return false;
    }
    
    const base64Part = parts[1];
    if (!base64Part || base64Part.trim().length === 0) {
      logger.error('图片数据缺少有效的base64编码部分');
      return false;
    }
    
    // 检查编码前缀
    const mimeType = parts[0];
    const validMimeTypes = ['data:image/jpeg', 'data:image/png', 'data:image/gif', 'data:image/webp', 'data:image/jpg'];
    const isValidMimeType = validMimeTypes.some(type => mimeType.startsWith(type));
    
    if (!isValidMimeType) {
      logger.error(`图片MIME类型无效: ${mimeType}`);
      return false;
    }

    // 尝试解码验证base64格式
    try {
      const buffer = Buffer.from(base64Part, 'base64');
      // 检查解码后的数据是否有效（非空且长度合理）
      if (buffer.length === 0 || buffer.length < 100) { // 100字节作为最小有效图片大小
        logger.error(`图片数据解码后长度异常: ${buffer.length}字节`);
        return false;
      }
      
      // 检查图片文件头(魔数)
      const fileSignatures = {
        jpeg: [0xFF, 0xD8, 0xFF],
        png: [0x89, 0x50, 0x4E, 0x47],
        gif: [0x47, 0x49, 0x46, 0x38],
        webp: [0x52, 0x49, 0x46, 0x46]
      };
      
      // 检查常见图片格式的文件头
      let isValidSignature = false;
      
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        isValidSignature = buffer[0] === fileSignatures.jpeg[0] && 
                          buffer[1] === fileSignatures.jpeg[1] && 
                          buffer[2] === fileSignatures.jpeg[2];
      } else if (mimeType.includes('png')) {
        isValidSignature = buffer[0] === fileSignatures.png[0] && 
                          buffer[1] === fileSignatures.png[1] && 
                          buffer[2] === fileSignatures.png[2] && 
                          buffer[3] === fileSignatures.png[3];
      } else if (mimeType.includes('gif')) {
        isValidSignature = buffer[0] === fileSignatures.gif[0] && 
                          buffer[1] === fileSignatures.gif[1] && 
                          buffer[2] === fileSignatures.gif[2];
      } else if (mimeType.includes('webp')) {
        isValidSignature = buffer[0] === fileSignatures.webp[0] && 
                          buffer[1] === fileSignatures.webp[1] && 
                          buffer[2] === fileSignatures.webp[2] && 
                          buffer[3] === fileSignatures.webp[3];
      }
      
      if (!isValidSignature) {
        logger.warning(`图片文件签名与MIME类型不匹配: ${mimeType}`);
        // 继续处理但记录警告，因为某些情况下base64编码可能合法但签名检测不准确
      }
      
      return true;
    } catch (decodeError) {
      logger.error(`base64解码失败: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`);
      return false;
    }
  } catch (error) {
    logger.error(`图片数据验证失败: ${error instanceof Error ? error.message : String(error)}`);
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
        logger.warning(`数据库操作失败，等待${delay}ms后重试(${attempt + 1}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // 所有重试都失败
  throw lastError;
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
                logger.info(`已将任务状态从${taskToUpdate.status}更新为processing，任务ID: ${taskId}`);
              }
            }
            
            return true;
          });
        } catch (statusUpdateError) {
          logger.error(`更新任务状态异常: ${statusUpdateError instanceof Error ? statusUpdateError.message : String(statusUpdateError)}`);
          // 继续执行，不中断流程
        }
        
        // 记录比例信息
        if (aspectRatio) {
          logger.info(`图片比例参数: aspectRatio=${aspectRatio}, standardAspectRatio=${standardAspectRatio || '未指定'}`);
        }
        
        // 用于记录提示词的变量
        let finalPrompt = "";
        // 定义单一消息结构
        const messages: ChatCompletionMessageParam[] = [];

        // 只添加一条消息，包含所有内容
        if (image) {
          logger.info(`处理用户上传的图片，任务ID: ${taskId}`);
          
          try {
            // 准备图片数据
            let imageData;
            if (image.startsWith('data:')) {
              imageData = image;
              logger.debug(`图片已包含data:URL前缀`);
            } else {
              // 添加前缀
              imageData = `data:image/jpeg;base64,${image}`;
              logger.debug(`为图片添加data:URL前缀`);
            }
            
            // 验证图片数据
            if (!validateImageData(imageData)) {
              logger.warning('图片数据格式无效，将使用纯文本提示');
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
              
              messages.push({
                role: 'user',
                content: userPromptWithImage
              } as ChatCompletionUserMessageParam);
              
              logger.debug(`添加单一消息，包含用户图片和提示词: ${promptText}`);
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
        
        // 图像生成参数
        const quality = "hd"; // 使用高清质量，提高输出图像质量
        const styleOption: "natural" | "vivid" = "vivid"; // 更生动的风格
        
        // 使用gpt-4o-all通过聊天API生成图像
        logger.info(`使用聊天API (gpt-4o-all)生成图片，提示词长度: ${finalPrompt.length}字符`);
        
        try {
          // 定义图像生成工具
          const tools = [
            {
              type: "function" as const,
              function: {
                name: "dalle_generate_image",
                description: "为用户生成图像并返回图像信息",
                parameters: {
                  type: "object",
                  properties: {
                    prompt: {
                      type: "string",
                      description: "用于生成图片的详细提示词"
                    },
                    size: {
                      type: "string",
                      description: "图片的尺寸，可选值: 1024x1024, 1792x1024, 1024x1792",
                      enum: ["1024x1024", "1792x1024", "1024x1792"]
                    },
                    quality: {
                      type: "string",
                      description: "图片的质量，可选值: standard, hd",
                      enum: ["standard", "hd"]
                    },
                    style: {
                      type: "string",
                      description: "图片的风格，可选值: vivid, natural",
                      enum: ["vivid", "natural"]
                    }
                  },
                  required: ["prompt"]
                }
              }
            }
          ];
          
          // 执行API调用
          logger.info(`开始调用gpt-4o-all聊天API进行图像生成`);
          logger.debug(`请求参数: 模型=gpt-4o-all, 消息数=${messages.length}, 温度=0.7, 工具=${JSON.stringify(tools)}`);
          logger.debug(`消息内容: ${JSON.stringify(messages).substring(0, 200)}...`);
          
          // 添加重试逻辑，不使用降级方案
          let retryCount = 0;
          const maxRetries = 3; // 增加重试次数
          logger.info(`配置纯重试策略，固定使用gpt-4o-all模型，最大重试次数: ${maxRetries}次`);
          let chatCompletion;
          
          while (true) {
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
              
              chatCompletion = await openaiClient.chat.completions.create({
                model: 'gpt-4o-all', // 固定使用gpt-4o-all模型
                messages: messages,
                max_tokens: 1000,
                temperature: 0.7,
                tools: tools, // 添加工具定义
                tool_choice: "auto" // 自动选择合适的工具
              });
              
              // 如果成功，跳出循环
              logger.info(`使用gpt-4o-all模型成功生成图像`);
              break;
              
            } catch (apiError) {
              const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
              logger.error(`API调用失败: ${errorMsg}`);
              
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
          
          // 记录响应信息
          logger.debug(`API响应ID: ${chatCompletion.id}`);
          logger.debug(`实际使用模型: ${chatCompletion.model}`);
          
          if (chatCompletion.usage) {
            logger.debug(`Token使用情况: 提示=${chatCompletion.usage.prompt_tokens}, 完成=${chatCompletion.usage.completion_tokens}, 总计=${chatCompletion.usage.total_tokens}`);
          }
          
          // 从响应中提取图片URL
          const responseContent = chatCompletion.choices[0]?.message?.content || "";
          logger.debug(`API响应内容: ${responseContent.substring(0, 200)}...`);
          
          // 修改处理图像URL和引用ID的逻辑
          // 尝试从响应中提取图像URL或引用ID
          let imageUrl = '';
          const imageGeneration = chatCompletion.choices[0]?.message;
          
          logger.debug(`图像生成模型原始响应: ${JSON.stringify(imageGeneration)}`);
          
          // 尝试获取引用图像ID
          let referencedImageIds: string[] = [];
          
          try {
            // 检查是否有content字段
            if (imageGeneration.content) {
              // 检查是否为JSON格式的响应
              try {
                const contentObj = JSON.parse(imageGeneration.content);
                if (contentObj.referenced_image_ids && Array.isArray(contentObj.referenced_image_ids) && contentObj.referenced_image_ids.length > 0) {
                  referencedImageIds = contentObj.referenced_image_ids;
                  logger.debug(`找到引用图像ID: ${referencedImageIds.join(', ')}`);
                } else if (contentObj.image_id) {
                  // 处理单个image_id的情况
                  referencedImageIds = [contentObj.image_id];
                  logger.debug(`找到单个引用图像ID: ${contentObj.image_id}`);
                }
              } catch (e) {
                // 不是JSON格式，尝试使用正则表达式提取ID或URL
                logger.debug(`响应不是有效的JSON格式，尝试使用正则表达式提取ID或URL`);
                
                // 尝试提取形如"image_xxxx"的ID
                const idMatch = imageGeneration.content.match(/image_[a-zA-Z0-9_-]+/);
                if (idMatch) {
                  referencedImageIds = [idMatch[0]];
                  logger.debug(`使用正则表达式从文本中提取到图像ID: ${idMatch[0]}`);
                } else {
                  // 否则尝试提取URL
                  const urlMatch = imageGeneration.content.match(/https?:\/\/\S+?\.(?:jpg|jpeg|png|gif|webp)/gi);
                  if (urlMatch) {
                    imageUrl = urlMatch[0].replace(/[.,;]$/, ''); // 移除可能的结尾标点
                    logger.debug(`从文本中提取到图像URL: ${imageUrl}`);
                  }
                }
              }
            }
            
            // 检查是否有tool_calls字段并包含referenced_image_ids或其他图像相关信息
            if (!imageUrl && !referencedImageIds.length && imageGeneration.tool_calls) {
              for (const toolCall of imageGeneration.tool_calls) {
                try {
                  if (toolCall.function) {
                    // 记录工具调用信息，便于调试
                    logger.debug(`检测到工具调用: ${toolCall.function.name}`);
                    
                    if (toolCall.function.arguments) {
                      const args = JSON.parse(toolCall.function.arguments);
                      logger.debug(`工具调用参数: ${JSON.stringify(args)}`);
                      
                      // 检查各种可能的图像ID字段
                      if (args.referenced_image_ids && Array.isArray(args.referenced_image_ids) && args.referenced_image_ids.length > 0) {
                        referencedImageIds = args.referenced_image_ids;
                        logger.debug(`从tool_calls中找到引用图像ID: ${referencedImageIds.join(', ')}`);
                        break;
                      } else if (args.image_id) {
                        referencedImageIds = [args.image_id];
                        logger.debug(`从tool_calls中找到单个图像ID: ${args.image_id}`);
                        break;
                      } else if (args.image_url) {
                        imageUrl = args.image_url;
                        logger.debug(`从tool_calls中找到图像URL: ${imageUrl}`);
                        break;
                      }
                      
                      // 如果找不到明确的图像ID或URL但有提示词，记录下来以便后续处理
                      if (args.prompt) {
                        logger.debug(`工具调用包含提示词: ${args.prompt}`);
                      }
                    }
                  }
                } catch (e) {
                  logger.error(`解析tool_calls参数失败: ${e}`);
                }
              }
            }
            
            // 如果找到了引用图像ID，尝试获取实际图像
            if (referencedImageIds.length > 0) {
              logger.debug(`开始处理引用图像ID: ${referencedImageIds[0]}`);
              
              // 使用第一个引用ID获取图像
              const imageId = referencedImageIds[0];
              
              // 调用API获取图像内容
              const fetchImageResponse = await fetch(`https://api.tuzi.ai/v1/images/${imageId}/content`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${process.env.ZHUSHOU_API_KEY}`,
                  'Accept': 'image/*'
                }
              });
              
              if (!fetchImageResponse.ok) {
                throw new Error(`获取图像内容失败: ${fetchImageResponse.status} ${fetchImageResponse.statusText}`);
              }
              
              // 获取图像内容的Blob
              const imageBlob = await fetchImageResponse.blob();
              logger.debug(`成功获取图像内容, 大小: ${imageBlob.size} 字节, 类型: ${imageBlob.type}`);
              
              // 生成唯一文件名
              const fileName = `${imageId}.${imageBlob.type.split('/')[1] || 'png'}`;
              
              // 将Blob转换为ArrayBuffer
              const arrayBuffer = await imageBlob.arrayBuffer();
              
              // 上传到Supabase存储
              const { data: uploadData, error: uploadError } = await supabaseAdmin
                .storage
                .from('generated-images')
                .upload(fileName, arrayBuffer, {
                  contentType: imageBlob.type,
                  upsert: true
                });
                
              if (uploadError) {
                throw new Error(`图像上传到Supabase失败: ${uploadError.message}`);
              }
              
              // 获取公共URL
              const { data: { publicUrl } } = supabaseAdmin
                .storage
                .from('generated-images')
                .getPublicUrl(fileName);
                
              imageUrl = publicUrl;
              logger.debug(`成功上传图像并获取公共URL: ${imageUrl}`);
            }
          } catch (e) {
            logger.error(`处理图像URL或引用ID失败: ${e}`);
          }
          
          // 如果仍然没有URL，尝试从完整响应中查找
          if (!imageUrl) {
            try {
              const fullResponseText = JSON.stringify(chatCompletion);
              const urlMatches = fullResponseText.match(/https?:\/\/\S+?\.(?:jpg|jpeg|png|gif|webp)/gi);
              if (urlMatches && urlMatches.length > 0) {
                imageUrl = urlMatches[0].replace(/[",\\]$/, '');
                logger.debug(`从完整响应中提取到图像URL: ${imageUrl}`);
                
                // 保存URL到临时变量，以防后续处理中被意外清空
                const extractedUrl = imageUrl;
                
                // 确认提取的URL格式是否有效
                if (extractedUrl && extractedUrl.startsWith('http')) {
                  logger.info(`确认提取的URL有效: ${extractedUrl}`);
                  // 确保imageUrl被设置
                  imageUrl = extractedUrl;
                }
              } else {
                // 尝试从响应内容中提取JSON
                try {
                  const contentText = chatCompletion.choices[0]?.message?.content || "";
                  // 查找JSON格式的内容
                  const jsonMatch = contentText.match(/\{[\s\S]*?\}/);
                  if (jsonMatch) {
                    const jsonContent = JSON.parse(jsonMatch[0]);
                    if (jsonContent.image_url) {
                      imageUrl = jsonContent.image_url;
                      logger.debug(`从JSON响应中提取到图像URL: ${imageUrl}`);
                      
                      // 再次验证URL
                      if (imageUrl && imageUrl.startsWith('http')) {
                        logger.info(`确认JSON中提取的URL有效: ${imageUrl}`);
                      }
                    }
                  }
                } catch (jsonError) {
                  logger.error(`解析JSON内容失败: ${jsonError}`);
                }
              }
            } catch (e) {
              logger.error(`从完整响应提取URL失败: ${e}`);
            }
          }
          
          // 再次记录当前的imageUrl状态
          logger.debug(`URL提取处理完成后的imageUrl状态: ${imageUrl ? imageUrl : '未找到URL'}`);
          
          // 如果仍然没有找到URL，记录错误
          if (!imageUrl) {
            logger.error(`无法从响应中提取图像URL或处理引用ID`);
            logger.error(`完整响应: ${JSON.stringify(chatCompletion)}`);
            throw new Error('无法从响应中提取图像URL');
          }
          
          // 验证提取的URL格式
          if (!imageUrl.startsWith('http')) {
            logger.error(`提取的URL格式无效: ${imageUrl}`);
            throw new Error(`提取的URL格式无效: ${imageUrl}`);
          }
          
          // 最后的确认和记录
          logger.info(`成功从聊天API响应中提取图片URL: ${imageUrl}`);
          
          // 使用try-catch包装数据库操作，确保失败不影响返回结果
          try {
            // 更新任务状态
            const updateData = {
              status: 'completed',
              image_url: imageUrl,
              provider: 'tuzi',
              updated_at: new Date().toISOString(),
              completed_at: new Date().toISOString() // 添加完成时间
            };
            
            logger.debug(`准备更新数据库，使用数据: ${JSON.stringify(updateData)}`);
            
            const { error: updateError } = await supabaseAdmin
              .from('image_tasks')
              .update(updateData)
              .eq('task_id', taskId);
            
            if (updateError) {
              logger.error(`更新任务状态失败: ${updateError.message}`);
              // 如果更新失败，使用简化结构再次尝试
              await supabaseAdmin
                .from('image_tasks')
                .update({
                  status: 'completed',
                  image_url: imageUrl,
                  provider: 'tuzi'
                })
                .eq('task_id', taskId);
            }
            
            // 使用Promise.allSettled合并数据库操作
            await Promise.allSettled([
              // 1. 保存历史记录
              saveGenerationHistory(
                supabaseAdmin, 
                currentUser.id, 
                imageUrl, 
                finalPrompt, 
                style,
                aspectRatio,
                standardAspectRatio
              ).then(success => {
                if (success) {
                  logger.info(`历史记录保存成功`);
                } else {
                  logger.warning(`历史记录保存结果: ${success ? '成功' : '失败'}`);
                }
              }).catch(e => {
                logger.error(`保存历史记录失败: ${e.message || String(e)}`);
                // 记录遥测数据用于后续分析
                try {
                  console.error('历史记录保存错误详情:', e);
                } catch (loggingError) {}
              }),
              
              // 2. 创建通知记录 - 处理Promise
              (async () => {
                try {
                  const { error } = await supabaseAdmin
                    .from('task_notifications')
                    .upsert({
                      task_id: taskId,
                      user_id: currentUser.id,
                      status: 'completed',
                      image_url: imageUrl,
                      created_at: new Date().toISOString()
                    });
                    
                  if (error) {
                    logger.error(`创建通知记录失败: ${error.message}`);
                    // 这里不进行重试，因为通知不是关键功能
                  } else {
                    logger.info(`通知记录创建成功`);
                  }
                } catch (notifyError) {
                  logger.error(`创建通知记录异常: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`);
                }
              })()
            ]).then(results => {
              // 分析结果状态
              const [historyResult, notificationResult] = results;
              
              if (historyResult.status === 'rejected') {
                logger.error(`历史保存操作被拒绝: ${historyResult.reason}`);
              }
              
              if (notificationResult.status === 'rejected') {
                logger.error(`通知创建操作被拒绝: ${notificationResult.reason}`);
              }
              
              // 记录完成的操作数
              const successCount = results.filter(r => r.status === 'fulfilled').length;
              logger.info(`数据库操作完成，成功: ${successCount}/${results.length}`);
            });
            
            logger.info(`任务相关数据库操作已完成：任务ID=${taskId}`);
            
            // 返回成功生成的响应
            const endTime = Date.now();
            const timeTaken = (endTime - startTime) / 1000;
            
            logger.info(`图像生成成功，耗时: ${timeTaken.toFixed(2)}秒，图像URL: ${imageUrl}`);
            
            // 成功完成图片生成，直接从这里返回
            return NextResponse.json({ 
              taskId, 
              status: 'completed',
              imageUrl: imageUrl,
              message: '图像生成成功',
              credits: credits && typeof credits.credits === 'number' ? credits.credits - 1 : 0, // 修复可能为null的问题
              timestamp: new Date().toISOString(), // 添加时间戳
              historyUpdated: true, // 指示历史记录已更新，避免立即请求历史
              provider: 'tuzi',
              model: 'gpt-4o-all'
            });
          } catch (chatError) {
            logger.error(`聊天API调用失败: ${chatError instanceof Error ? chatError.message : String(chatError)}`);
            
            // 详细记录错误信息
            if (chatError instanceof Error) {
              logger.error(`错误类型: ${chatError.name}`);
              logger.error(`错误详情: ${chatError.message}`);
              logger.error(`错误堆栈: ${chatError.stack?.substring(0, 500) || '无堆栈信息'}`);
            }
            
            // 不再尝试回退，直接向上抛出错误
            throw new Error(`使用gpt-4o-all生成图像失败: ${chatError instanceof Error ? chatError.message : String(chatError)}`);
          }
        } catch (generateError) {
          logger.error(`图像生成失败: ${generateError instanceof Error ? generateError.message : String(generateError)}`);
          
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
                error_message: generateError instanceof Error ? generateError.message : String(generateError),
                updated_at: new Date().toISOString()
              })
              .eq('task_id', taskId);
              
            if (updateError) {
              // 如果遇到error_details字段不存在的错误，尝试不使用该字段
              if (updateError.message.includes('error_details')) {
                logger.warning(`error_details字段可能不存在，尝试不使用该字段更新`);
                await supabaseAdmin
                  .from('image_tasks')
                  .update({
                    status: 'failed',
                    provider: 'tuzi',
                    error_message: generateError instanceof Error ? generateError.message : String(generateError),
                    updated_at: new Date().toISOString()
                  })
                  .eq('task_id', taskId);
              } else {
                logger.error(`更新任务失败状态时出错: ${updateError.message}`);
              }
            }
          } catch (updateError: unknown) {
            logger.error(`更新任务失败状态异常: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
          }
          
          // 返回创建成功但生成失败的响应
          return NextResponse.json({ 
            taskId, 
            status: 'failed',
            error: '图像生成失败',
            details: generateError instanceof Error ? generateError.message : String(generateError),
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