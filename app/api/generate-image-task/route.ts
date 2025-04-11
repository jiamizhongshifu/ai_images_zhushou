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
    // 始终使用gpt-4o-all作为模型名称
    const modelUsed = 'gpt-4o-all';
    
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
        model_used: modelUsed,
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
  // 记录完整内容用于调试
  logger.debug(`尝试从内容中提取URL: ${content.substring(0, 300)}...`);
  
  // 首先尝试提取URL
  const urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(jpe?g|png|gif|webp|bmp))/i) || 
                   content.match(/(https?:\/\/[^\s"'<>]+)/i);
  
  if (urlMatch && urlMatch[1]) {
    logger.debug(`从内容中提取到URL: ${urlMatch[1]}`);
    return urlMatch[1];
  }
  
  // 尝试提取可能包含在Markdown图片标记中的URL - 如 ![description](url)
  const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)"'<>]+)\)/i);
  if (markdownMatch && markdownMatch[1]) {
    logger.debug(`从Markdown标记中提取到URL: ${markdownMatch[1]}`);
    return markdownMatch[1];
  }
  
  // 尝试提取HTML标签中的URL - 如 <img src="url" />
  const htmlMatch = content.match(/<img.*?src=["'](https?:\/\/[^\s"'<>]+)["']/i);
  if (htmlMatch && htmlMatch[1]) {
    logger.debug(`从HTML标签中提取到URL: ${htmlMatch[1]}`);
    return htmlMatch[1];
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
          provider: 'gpt-4o-all',
          model: 'gpt-4o-all',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (taskError) {
        console.error('创建任务记录失败:', taskError.message);
        throw new Error(`创建任务记录失败: ${taskError.message}`);
      }
      
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
        let response, imageUrl, enhancedPrompt;
        
        // 根据是否有图片选择不同的处理流程
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
            
            // 验证图片数据有效性并尝试修复
            const isValidBase64Pattern = /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/;
            if (!isValidBase64Pattern.test(imageData)) {
              logger.warning("图片URL格式不符合要求，尝试修复...");
              
              // 提取MIME类型
              let mimeType = 'image/jpeg'; // 默认MIME类型
              if (imageData.includes('data:image/')) {
                const mimeMatch = imageData.match(/data:image\/([a-z]+);/);
                if (mimeMatch && mimeMatch[1]) {
                  mimeType = `image/${mimeMatch[1]}`;
                }
              }
              
              // 提取base64部分并清理
              let base64Part = '';
              if (imageData.includes('base64,')) {
                base64Part = imageData.split('base64,')[1];
              } else {
                base64Part = image.includes('base64,') ? image.split('base64,')[1] : image;
              }
              
              // 清理base64数据
              if (base64Part) {
                // 移除所有非base64字符
                const cleanBase64 = base64Part.replace(/[^A-Za-z0-9+/=]/g, '');
                imageData = `data:${mimeType};base64,${cleanBase64}`;
                logger.debug(`已修复图片数据格式: ${imageData.substring(0, 30)}...`);
              }
            }
            
            // 再次验证图片数据
            if (!isValidBase64Pattern.test(imageData)) {
              logger.warning(`修复后的图片数据仍不符合要求，将尝试继续处理但可能会失败`);
            } else {
              logger.debug(`图片数据格式有效`);
            }
            
            // 第一步：使用视觉模型分析图片，生成描述性文本
            logger.info(`使用视觉模型分析图片，任务ID: ${taskId}`);
            
            // 构建视觉分析消息 - 确保与tuzi-openai.md示例一致
            const visionMessages = [
              {
                role: 'user' as const,
                content: [
                  {
                    type: "image_url" as const,
                    image_url: {
                      url: imageData
                    }
                  },
                  {
                    type: "text" as const,
                    text: "请详细描述这张图片的内容和风格，生成一段描述性文本，作为后续生成类似图片的提示词。"
                  }
                ]
              }
            ];
            
            // 调用视觉模型API - 在tuzi-openai.md中使用的方式
            try {
              logger.info(`调用视觉模型API (gpt-4o-all)，请求参数:`);
              logger.info(`- 模型: gpt-4o-all`);
              logger.info(`- 消息数: ${visionMessages.length}`);
              logger.info(`- 第一条消息角色: ${visionMessages[0].role}`);
              logger.info(`- 图片URL前缀: ${imageData.substring(0, 30)}...`);
              
              // 添加详细的API请求信息
              logger.debug(`完整API请求参数如下:`);
              logger.debug(`- 模型: gpt-4o-all`);
              logger.debug(`- 消息: [用户消息，含图片URL和文本提示]`);
              logger.debug(`- 最大tokens: 1000`);
              
              // 执行API调用 - 修改为兼容GPT-4o模型的配置
              const visionCompletion = await openaiClient.chat.completions.create({
                model: 'gpt-4o-all',
                messages: visionMessages,
                max_tokens: 1000,
                temperature: 0.7,
              });
              
              // 记录API响应结果
              logger.debug(`API响应ID: ${visionCompletion.id}`);
              logger.debug(`实际使用模型: ${visionCompletion.model}`);
              
              if (visionCompletion.usage) {
                logger.debug(`Token使用情况: 提示=${visionCompletion.usage.prompt_tokens}, 完成=${visionCompletion.usage.completion_tokens}, 总计=${visionCompletion.usage.total_tokens}`);
              }
              
              // 检查响应结构有效性
              if (!visionCompletion.choices || visionCompletion.choices.length === 0) {
                logger.error(`视觉模型API未返回有效的choices数组`);
                throw new Error('视觉模型API返回结构异常');
              }
              
              const responseContent = visionCompletion.choices[0]?.message?.content || "";
              logger.debug(`响应内容片段: ${responseContent.substring(0, 100)}...`);
              
              if (!responseContent || responseContent.includes('无法分析')) {
                logger.warning(`视觉模型未能提供有效描述: ${responseContent}`);
                // 使用备选描述和用户提供的提示词
                enhancedPrompt = prompt 
                  ? prompt 
                  : "生成一张精美艺术图像";
                if (style) {
                  enhancedPrompt += `, ${style}风格`;
                }
                logger.info(`使用备选提示词: ${enhancedPrompt}`);
              } else {
                logger.info(`图片分析结果: ${responseContent.substring(0, 100)}...`);
                
                // 第二步：结合用户提示词和风格，构建增强的提示词
                enhancedPrompt = prompt 
                  ? `${prompt}. 参考描述: ${responseContent}`
                  : responseContent;
                
                if (style) {
                  enhancedPrompt += `, ${style}风格`;
                }
              }
              
              logger.info(`生成增强提示词: ${enhancedPrompt.substring(0, 100)}...`);
            } catch (visionError) {
              logger.error(`视觉API调用失败: ${visionError instanceof Error ? visionError.message : String(visionError)}`);
              
              // 详细记录错误信息，便于诊断
              if (visionError instanceof Error) {
                logger.error(`错误类型: ${visionError.name}`);
                logger.error(`错误详情: ${visionError.message}`);
                logger.error(`错误堆栈: ${visionError.stack?.substring(0, 500) || '无堆栈信息'}`);
                
                // 检查是否包含OpenAI API错误信息
                const errorObj = visionError as any;
                if (errorObj.status) {
                  logger.error(`API状态码: ${errorObj.status}`);
                }
                if (errorObj.headers) {
                  logger.error(`API响应头: ${JSON.stringify(errorObj.headers)}`);
                }
                if (errorObj.error) {
                  logger.error(`API错误详情: ${JSON.stringify(errorObj.error)}`);
                }
              }
              
              // 视觉API失败时的备用方案
              enhancedPrompt = prompt || "生成一张精美艺术图像";
              if (style) {
                enhancedPrompt += `, ${style}风格`;
              }
              logger.info(`使用备用提示词: ${enhancedPrompt}`);
            }
            
            // 第三步：使用DALL-E模型生成新图像
            logger.info(`使用${imageModel}生成新图像，任务ID: ${taskId}`);
            
          } catch (analyzeError) {
            logger.error(`分析图片失败: ${analyzeError instanceof Error ? analyzeError.message : String(analyzeError)}`);
            throw new Error(`图片分析失败: ${analyzeError instanceof Error ? analyzeError.message : String(analyzeError)}`);
          }
        } else {
          // 如果没有图片，直接使用用户提示词
          enhancedPrompt = prompt;
          logger.info(`使用用户提供的提示词: ${enhancedPrompt.substring(0, 100)}...`);
        }
        
        // 获取图片尺寸比例参数
        const { aspectRatio, standardAspectRatio } = body;
        
        // 生成图像尺寸
        let size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024"; // 默认尺寸
        
        // 根据请求参数和提示词确定合适的尺寸
        if (aspectRatio) {
          // 根据实际图片比例决定输出尺寸
          logger.info(`检测到上传图片比例: ${aspectRatio}`);
          
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
        else if (style && style.includes('wide') || enhancedPrompt.includes('landscape') || enhancedPrompt.includes('panorama')) {
          size = "1792x1024"; // 宽屏比例
          logger.info(`使用宽屏尺寸: ${size}`);
        } else if (style && style.includes('tall') || enhancedPrompt.includes('portrait') || enhancedPrompt.includes('vertical')) {
          size = "1024x1792"; // 高屏比例
          logger.info(`使用竖屏尺寸: ${size}`);
        } else {
          logger.info(`使用标准尺寸: ${size}`);
        }
        
        // 图像生成参数
        const quality = "hd"; // 使用高清质量，提高输出图像质量
        const styleOption: "natural" | "vivid" = "vivid"; // 更生动的风格
        
        // 使用gpt-4o-all通过聊天API生成图像
        logger.info(`使用聊天API (gpt-4o-all)生成图片，提示词长度: ${enhancedPrompt.length}字符`);
        
        // 构建符合OpenAI SDK的消息格式
        let messages: Array<any> = [];
        
        // 用户提示消息
        const userMessage: any = {
          role: 'user',
          content: []
        };
        
        // 如果有上传的图片，添加为消息内容的一部分
        if (image) {
          // 准备图片数据
          let refImageData;
          if (image.startsWith('data:')) {
            refImageData = image;
          } else {
            refImageData = `data:image/jpeg;base64,${image}`;
          }
          
          // 添加图片内容
          userMessage.content.push({
            type: "image_url",
            image_url: {
              url: refImageData
            }
          });
          
          logger.info(`已添加参考图片到生成请求中`);
        }
        
        // 添加文本提示
        userMessage.content.push({
          type: "text",
          text: enhancedPrompt + "。请将此描述转换为图像。" // 转换为图像的提示
        });
        
        // 添加到消息数组
        messages.push(userMessage);
        
        logger.debug(`聊天API请求参数: 模型=gpt-4o-all, 消息数=${messages.length}`);
        
        try {
          // 执行API调用
          const chatCompletion = await openaiClient.chat.completions.create({
            model: 'gpt-4o-all',
            messages: messages,
            max_tokens: 1000,
            temperature: 0.7,
          });
          
          // 从响应中提取图片URL
          const responseContent = chatCompletion.choices[0]?.message?.content || "";
          logger.debug(`API响应内容: ${responseContent.substring(0, 100)}...`);
          
          // 提取图片URL
          imageUrl = extractImageUrl(responseContent);
          
          if (!imageUrl) {
            logger.error(`无法从响应中提取图片URL，原始响应: ${responseContent}`);
            throw new Error('无法从生成结果中提取图片URL');
          }
          
          logger.info(`成功从聊天API响应中提取图片URL: ${imageUrl}`);
        } catch (chatError) {
          logger.error(`聊天API调用失败: ${chatError instanceof Error ? chatError.message : String(chatError)}`);
          
          // 详细记录错误信息
          if (chatError instanceof Error) {
            logger.error(`错误类型: ${chatError.name}`);
            logger.error(`错误详情: ${chatError.message}`);
            logger.error(`错误堆栈: ${chatError.stack?.substring(0, 500) || '无堆栈信息'}`);
          }
          
          // 失败时尝试回退到DALL-E生成
          logger.info(`尝试回退到DALL-E API进行图像生成`);
          
          // 使用传统的DALL-E API生成图像
          const fallbackModel = 'dall-e-3';
          logger.info(`使用回退模型: ${fallbackModel}`);
          
          response = await openaiClient.images.generate({
            model: fallbackModel,
            prompt: enhancedPrompt,
            n: 1,
            size: size,
            quality: quality,
            style: styleOption,
            response_format: "url" // 获取URL而非base64
          });
          
          // 获取生成的图像URL
          imageUrl = response.data[0].url;
          logger.info(`使用回退方案成功生成图片: ${imageUrl}`);
        }
        
        if (!imageUrl) {
          throw new Error('API未返回有效的图像URL');
        }
        
        // 计算耗时
        const endTime = Date.now();
        const timeTaken = (endTime - startTime) / 1000;
        
        logger.info(`图像生成成功，耗时: ${timeTaken.toFixed(2)}秒，图像URL: ${imageUrl}`);
        
        // 更新任务状态 - 修复result_url字段名称问题
        const updateData = {
          status: 'completed',
          image_url: imageUrl, // 使用正确的字段名image_url而非result_url
          updated_at: new Date().toISOString()
        };
        
        const { error: updateError } = await supabaseAdmin
          .from('image_tasks')
          .update(updateData)
          .eq('task_id', taskId);
          
        if (updateError) {
          logger.error(`更新任务状态失败: ${updateError.message}`);
          
          // 尝试更精简的数据结构
          if (updateError.message.includes('column') || updateError.message.includes('schema')) {
            logger.info(`尝试使用更精简的数据结构更新任务状态`);
            
            // 仅使用最基本的字段
            const minimalUpdateData = {
              status: 'completed',
              image_url: imageUrl
            };
            
            const { error: minimalUpdateError } = await supabaseAdmin
              .from('image_tasks')
              .update(minimalUpdateData)
              .eq('task_id', taskId);
              
            if (minimalUpdateError) {
              logger.error(`使用精简结构更新任务状态仍然失败: ${minimalUpdateError.message}`);
              throw new Error(`更新任务状态失败: ${minimalUpdateError.message}`);
            } else {
              logger.info(`使用精简结构成功更新任务状态`);
            }
          } else {
            throw new Error(`更新任务状态失败: ${updateError.message}`);
          }
        }
        
        // 确保数据库更新完成，添加额外验证
        const { data: verifyTask, error: verifyError } = await supabaseAdmin
          .from('image_tasks')
          .select('status, image_url') // 使用正确的字段名
          .eq('task_id', taskId)
          .single();
          
        if (verifyError || !verifyTask || verifyTask.status !== 'completed') {
          logger.error(`更新任务状态后验证失败: ${verifyError?.message || '状态未更新'}`);
          // 再次尝试更新状态（使用最小化字段集）
          const fallbackUpdateData = {
            status: 'completed',
            image_url: imageUrl
          };
          
          await supabaseAdmin
            .from('image_tasks')
            .update(fallbackUpdateData)
            .eq('task_id', taskId);
            
          logger.info(`已尝试再次更新任务状态（使用最小化字段集）`);
        } else {
          logger.info(`已确认任务状态更新为completed，可直接查询: ${taskId}`);
        }
        
        // 通知前端任务完成
        try {
          // 使用数据库创建通知记录
          await supabaseAdmin
            .from('task_notifications')
            .upsert({
              task_id: taskId,
              user_id: currentUser.id,
              status: 'completed',
              image_url: imageUrl,
              created_at: new Date().toISOString()
            });
            
          logger.info(`已在数据库中创建任务完成通知记录: ${taskId}`);
        } catch (notifyError) {
          logger.error(`创建任务通知记录失败: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`);
          // 通知失败不应影响主流程
        }
        
        try {
          // 保存到历史记录 - 也改为异步并忽略错误
          await saveGenerationHistory(
            supabaseAdmin, 
            currentUser.id, 
            imageUrl, 
            enhancedPrompt, 
            style,
            aspectRatio,
            standardAspectRatio
          ).catch(historyError => {
            logger.error(`保存图像历史记录失败: ${historyError.message}`);
          });
        } catch (historyError) {
          logger.error(`保存历史记录出错: ${historyError instanceof Error ? historyError.message : String(historyError)}`);
          // 保存历史失败不应影响返回结果
        }
        
        // 无论数据库更新是否成功，都返回图像URL给用户
        // 返回成功生成的响应
        return NextResponse.json({ 
          taskId, 
          status: 'completed',
          imageUrl: imageUrl,
          message: '图像生成成功'
        });
        
      } catch (generateError) {
        logger.error(`图像生成失败: ${generateError instanceof Error ? generateError.message : String(generateError)}`);
        
        // 更新任务状态为失败
        await supabaseAdmin
          .from('image_tasks')
          .update({
            status: 'failed',
            error_message: generateError instanceof Error ? generateError.message : String(generateError),
            updated_at: new Date().toISOString()
          })
          .eq('task_id', taskId);
        
        // 返回创建成功但生成失败的响应
        return NextResponse.json({ 
          taskId, 
          status: 'failed',
          error: '图像生成失败',
          details: generateError instanceof Error ? generateError.message : String(generateError),
          suggestion: '请稍后重试或使用不同的提示词'
        }, { status: 500 });
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
          .eq('user_id', currentUser.id);
          
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