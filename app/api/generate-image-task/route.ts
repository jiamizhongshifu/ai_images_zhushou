import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getApiConfig } from '@/utils/env';
import { v4 as uuid } from 'uuid';
import { OpenAI } from 'openai';
import { updateCredits } from '@/utils/credit-service';

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
      aspectRatio = null,
      standardAspectRatio = null,
      image = null // 添加图片参数
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
    
    // 记录详细的请求信息，便于调试
    logger.info(`创建图像任务: ${taskId}, 用户: ${user.id}, 提示词: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`);
    
    // 记录图片信息但不记录完整base64
    if (image) {
      const imgPrefix = image.substring(0, 30);
      const imgLength = image.length;
      logger.debug(`图片数据: ${imgPrefix}... (长度: ${imgLength}字符), 风格: ${style}, 比例: ${aspectRatio}`);
    } else {
      logger.debug(`没有上传图片, 风格: ${style}, 比例: ${aspectRatio}`);
    }
    
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
    
    // 创建一个Promise，但不等待它完成
    // 这样API可以快速返回，同时任务继续在后台处理
    const generatePromise = (async () => {
      try {
        const tuziClient = createTuziClient();
        let response;
        
        // 根据是否有图片选择不同的处理逻辑
        if (image) {
          // ==============================================
          // 图片变换模式：使用上传的图片作为参考进行生成
          // ==============================================
          
          logger.debug(`使用图片变换模式`);
          
          // 准备基础图片数据
          let imageData;
          if (image.startsWith('data:image')) {
            // 处理base64图片
            const base64Data = image.split(',')[1];
            imageData = `data:image/jpeg;base64,${base64Data}`;
            logger.debug(`处理base64图片，长度: ${base64Data.length}`);
          } else {
            // 直接使用图片URL
            imageData = image;
            logger.debug(`使用图片URL: ${image.substring(0, 50)}...`);
          }
          
          // 构建明确的提示词
          const styleText = style ? `${style}风格` : '吉卜力风格';
          const enhancedPrompt = `将这张图片转换为${styleText}的艺术作品。保留图片中的主要内容和场景，但使用${styleText}重新绘制。${prompt}`;
          
          logger.debug(`增强的提示词: ${enhancedPrompt}`);
          
          // ==== 方法1：使用聊天补全API进行图片变换 ====
          
          // 创建系统消息 - 明确指导模型生成图片而不是提问
          const systemMessage = "你是一个专业的图像生成助手。你应该直接返回一个图像URL，而不是提问或解释。用户提供了图片和描述，你的任务是生成一个符合描述的新图片并返回它的URL。请直接返回一个图像链接，不要有任何其他文字。";
          
          // 创建API参数
          const chatParams: any = {
            model,
            messages: [
              {
                role: "system",
                content: systemMessage
              },
              {
                role: "user",
                content: [
                  {
                    type: "text", 
                    text: enhancedPrompt
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: imageData
                    }
                  }
                ]
              }
            ],
            temperature: 0.7,
            max_tokens: 150,
            user: `task_${taskId}`
          };
          
          // 记录参数（不包含图片数据）
          const logParams = JSON.parse(JSON.stringify(chatParams));
          if (logParams.messages[1]?.content[1]?.image_url?.url?.startsWith('data:')) {
            logParams.messages[1].content[1].image_url.url = '[BASE64_IMAGE_DATA]';
          }
          logger.debug(`聊天API调用参数: ${JSON.stringify(logParams, null, 2)}`);
          
          // 调用聊天API
          logger.debug(`调用聊天API进行图片变换`);
          try {
            const chatResponse = await tuziClient.chat.completions.create(chatParams);
            
            // 处理聊天API响应
            if (chatResponse.choices && chatResponse.choices[0]?.message?.content) {
              const content = chatResponse.choices[0].message.content;
              logger.debug(`聊天API返回内容: ${content}`);
              
              // 尝试从内容中提取URL
              const imageUrl = extractImageUrl(content);
              
              if (imageUrl) {
                // 如果成功提取到URL，使用这个URL
                response = {
                  data: [{ url: imageUrl }]
                };
                logger.debug(`成功从聊天API响应中提取图片URL: ${imageUrl}`);
              } else {
                // 无法从聊天API响应中提取URL，使用备选方案
                logger.debug(`无法从聊天API响应中提取URL，尝试使用图像API`);
                throw new Error("无法从聊天API响应提取图片URL");
              }
            } else {
              logger.debug(`聊天API返回无效响应`);
              throw new Error("聊天API返回无效响应");
            }
          } catch (chatError) {
            // 聊天API调用失败，尝试使用图像API
            logger.debug(`聊天API调用失败: ${chatError instanceof Error ? chatError.message : String(chatError)}`);
            logger.debug(`尝试使用图像API作为备选方案`);
            
            // ==== 方法2：使用图像生成API作为备选方案 ====
            
            // 准备图像API参数
            const imageParams = {
              prompt: `${styleText}的${prompt}`,
              model,
              response_format: 'url' as const,
              user: `task_${taskId}`
            };
            
            logger.debug(`图像API调用参数: ${JSON.stringify(imageParams, null, 2)}`);
            
            // 调用图像API
            response = await tuziClient.images.generate(imageParams);
            logger.debug(`成功调用图像API`);
          }
        } else {
          // ==============================================
          // 普通图片生成模式：仅基于提示词生成
          // ==============================================
          
          logger.debug(`使用普通图片生成模式`);
          
          // 构建提示词
          const finalPrompt = style ? `${style}风格的${prompt}` : prompt;
          
          // 准备图像API参数
          const imageParams = {
            prompt: finalPrompt,
            model,
            response_format: 'url' as const,
            user: `task_${taskId}`
          };
          
          logger.debug(`图像API调用参数: ${JSON.stringify(imageParams, null, 2)}`);
          
          // 调用图像API
          response = await tuziClient.images.generate(imageParams);
          logger.debug(`成功调用图像API`);
        }
        
        // 处理成功响应
        if (response && response.data && response.data[0]?.url) {
          const imageUrl = response.data[0].url;
          logger.info(`任务 ${taskId} 图像生成成功，URL: ${imageUrl}`);
          
          // 更新任务状态为完成
          await supabase.from('image_tasks').update({
            status: 'completed',
            image_url: imageUrl,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }).eq('id', taskId);
          
          // 保存到历史记录表
          await saveGenerationHistory(
            supabase, 
            user.id, 
            imageUrl, 
            prompt, 
            style, 
            aspectRatio, 
            standardAspectRatio
          );

          // 扣除用户点数
          try {
            // 创建管理员客户端以便更新点数
            const adminClient = await createAdminClient();
            logger.info(`准备从用户 ${user.id} 扣除1点积分`);
            
            // 查询用户当前点数
            const { data: creditsData, error: fetchError } = await adminClient
              .from('ai_images_creator_credits')
              .select('credits')
              .eq('user_id', user.id)
              .maybeSingle();
              
            if (fetchError) {
              logger.error(`查询用户点数失败: ${fetchError.message}`);
              throw new Error(`查询点数失败: ${fetchError.message}`);
            }
            
            if (!creditsData) {
              logger.info(`用户 ${user.id} 点数记录不存在，创建初始记录`);
              
              // 创建新记录，初始5点并扣除1点
              const { data: newRecord, error: insertError } = await adminClient
                .from('ai_images_creator_credits')
                .insert({
                  user_id: user.id,
                  credits: 4, // 默认5点，减去本次使用的1点
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .select('credits')
                .single();
                
              if (insertError) {
                logger.error(`创建用户点数记录失败: ${insertError.message}`);
                throw new Error(`创建点数记录失败: ${insertError.message}`);
              }
              
              logger.info(`成功为用户 ${user.id} 创建点数记录并扣除1点，剩余: ${newRecord.credits}`);

              // 通知前端更新点数
              await notifyCreditsUpdate(user.id, newRecord.credits);
              
              return;
            }
            
            // 验证点数是否足够
            if (creditsData.credits < 1) {
              logger.error(`用户 ${user.id} 点数不足，当前点数: ${creditsData.credits}`);
              throw new Error(`点数不足，无法生成图像`);
            }
            
            // 更新用户点数
            const newCredits = creditsData.credits - 1;
            const { data: updatedRecord, error: updateError } = await adminClient
              .from('ai_images_creator_credits')
              .update({
                credits: newCredits,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', user.id)
              .select('credits')
              .single();
              
            if (updateError) {
              logger.error(`更新用户点数失败: ${updateError.message}`);
              throw new Error(`点数扣除失败: ${updateError.message}`);
            }
            
            logger.info(`成功从用户 ${user.id} 扣除1点，剩余点数: ${updatedRecord.credits}`);

            // 通知前端更新点数
            await notifyCreditsUpdate(user.id, updatedRecord.credits);
          } catch (creditsError) {
            logger.error(`扣除点数过程中出错: ${creditsError instanceof Error ? creditsError.message : String(creditsError)}`);
            // 即使扣除点数失败，仍然继续，因为图片已生成成功
          }
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