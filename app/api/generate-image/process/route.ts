import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { OpenAI } from 'openai';
import { getApiConfig, TuziConfig } from '@/utils/env';
import { addBase64Prefix, compressImageServer, image2Base64 } from '@/utils/image/image2Base64';
import dns from 'dns';
import https from 'https';
import http from 'http';
import fs from 'fs';
import { persistImageUrl } from '@/utils/image/persistImage';
import { uploadImageToStorage, cleanupTemporaryImage } from '@/utils/image/uploadImageToStorage';

// 设置日志级别常量
const LOG_LEVELS = {
  ERROR: 0,    // 只显示错误
  WARN: 1,     // 显示警告和错误
  INFO: 2,     // 显示信息、警告和错误
  DEBUG: 3     // 显示所有日志
};

// 获取环境变量中的日志级别，默认为INFO
const currentLogLevel = (() => {
  const level = process.env.LOG_LEVEL || 'INFO';
  switch (level.toUpperCase()) {
    case 'ERROR': return LOG_LEVELS.ERROR;
    case 'WARN': return LOG_LEVELS.WARN;
    case 'INFO': return LOG_LEVELS.INFO;
    case 'DEBUG': return LOG_LEVELS.DEBUG;
    default: return LOG_LEVELS.INFO;
  }
})();

// 日志工具函数
const logger = {
  error: (message: string) => {
    console.error(`[图片生成错误] ${message}`);
  },
  warn: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn(`[图片生成警告] ${message}`);
    }
  },
  info: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      console.log(`[图片生成] ${message}`);
    }
  },
  debug: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.log(`[图片生成调试] ${message}`);
    }
  }
};

// 防止并发请求的锁
let isProcessing = false;

// 缓存图资支持的模型列表
let cachedTuziModels: string[] | null = null;

// 网络请求配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 增加到3秒
const TIMEOUT = 270000; // 270秒，给Vercel平台留出30秒处理开销

// 延时函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 创建图资API客户端 - 按照tuzi-openai.md的方式
function createTuziClient() {
  // 获取环境配置
  const apiConfig = getApiConfig('tuzi') as TuziConfig;
  
  // 优先使用环境变量中的配置
  const apiKey = apiConfig.apiKey || process.env.OPENAI_API_KEY;
  const baseURL = apiConfig.apiUrl || process.env.OPENAI_BASE_URL || "https://api.tu-zi.com/v1";
  
  logger.info(`创建图资API客户端，使用BASE URL: ${baseURL}，模型: ${process.env.OPENAI_MODEL || 'gpt-4o-image-vip'}`);
  
  // 返回配置的客户端 - 使用图资API
  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
    timeout: TIMEOUT,
    defaultHeaders: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Connection': 'keep-alive'
    },
    maxRetries: 2
  });
}

// 修改提示词构建逻辑
function buildPrompt(style: string | null, originalPrompt: string | null, aspectRatio: string | null): string {
  let finalPrompt = originalPrompt || "";
  
  // 添加样式信息
  if (style) {
    finalPrompt = `以${style}风格创作: ${finalPrompt}`;
  }
  
  // 不再需要添加比例信息，因为现在通过JSON格式的ratio字段传递
  
  // 确保提示词简洁明了
  return finalPrompt.trim() || "创建一张精美图片";
}

interface ExtendedImageGenerateParams {
  model: string;
  prompt: string;
  n: number;
  size: "1024x1024" | "256x256" | "512x512" | "1792x1024" | "1024x1792";
  response_format: "url" | "b64_json";
  reference_image?: string;
  style?: string;
  aspect_ratio?: string;
}

// 直接生成图像API
async function generateImage({
  prompt = '',
  base64Image = null,
  style = null,
  aspectRatio = null,
  useStandardRatio = null
}: {
  prompt?: string;
  base64Image?: string | null;
  style?: string | null;
  aspectRatio?: string | null;
  useStandardRatio?: string | null;
}): Promise<{ imageUrl: string; genId: string | null }> {
  let retryCount = 0;
  let currentPrompt = prompt;
  let lastError: Error | null = null;
  let genId: string | null = null; // 保存图片生成ID
  let imageUrl: string | null = null; // 上传后的图片URL
  let temporaryImageUrl: string | null = null; // 标记临时图片URL，用于后续清理

  // 如果有base64图片，尝试上传到存储服务获取URL
  if (base64Image) {
    try {
      // 使用一个通用ID作为用户ID，因为这里不需要特定的用户
      const userId = 'system';
      logger.info('开始将base64图片上传到存储服务');
      imageUrl = await uploadImageToStorage(base64Image, userId);
      temporaryImageUrl = imageUrl; // 标记为临时URL，便于后续清理
      logger.info(`成功将图片上传到存储服务，获取URL: ${imageUrl}`);
      
      // 上传成功后，使用URL替代base64
      base64Image = null; // 清空base64数据，减少内存占用
    } catch (uploadError) {
      logger.warn(`上传图片到存储服务失败: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
      logger.info('将继续使用base64方式传递图片');
      // 上传失败继续使用原始base64，确保功能正常
    }
  }

  while (retryCount <= MAX_RETRIES) {
    try {
      logger.info(`开始生成图像，提示词: ${currentPrompt.substring(0, 100)}...`);
      
      // 创建API客户端 - 每次重试都创建新的客户端实例
      const tuziClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
        baseURL: process.env.OPENAI_BASE_URL,
        timeout: TIMEOUT,
        defaultHeaders: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Connection': 'keep-alive'
        },
        // 重试网络错误
        maxRetries: 3,
        // 添加随机延迟避免429
      });
      
      // 使用优化后的提示词
      const formattedPrompt = buildPrompt(style, currentPrompt, aspectRatio);
      
      // 检查网络连接
      logger.info(`尝试连接API服务器 ${process.env.OPENAI_BASE_URL}...`);
      await checkApiConnectivity();
      
      // 构建消息内容 - 按照tuzi-openai.md文档格式
      let messageContent = formattedPrompt;
      
      // 优先从全局存储中获取已有的genId
      if (!genId && global._lastGenIds) {
        const cacheKey = JSON.stringify({ prompt, style, aspectRatio });
        const cachedGenId = global._lastGenIds[cacheKey];
        if (cachedGenId) {
          genId = cachedGenId;
          logger.info(`从缓存中恢复gen_id: ${genId}`);
        }
      }
      
      // 如果有genId（修改已有图片的场景），则使用JSON格式
      if (genId) {
        // 如果已经获取到gen_id，始终使用相同的gen_id进行请求
        const promptData = {
          prompt: formattedPrompt,
          ratio: aspectRatio || "1:1",
          gen_id: genId,
          // 添加保持图片内容的标志
          preserve_content: true
        };
        messageContent = JSON.stringify(promptData);
        logger.info(`使用现有gen_id: ${genId}继续请求进度`);
      } else if (base64Image || imageUrl) {
        // 如果有图片但没有genId
        const promptData: any = {
          prompt: formattedPrompt,
          ratio: aspectRatio || "1:1",
          // 添加保持图片内容的标志
          preserve_content: true,
          keep_subject: true
        };
        
        // 添加图片引用 (如果上传成功则使用URL，否则继续使用base64)
        if (imageUrl) {
          promptData.image_url = imageUrl;
          logger.info('使用上传后的图片URL进行请求');
        } else if (base64Image) {
          promptData.image = base64Image;
          logger.info('使用base64数据进行请求');
        }
        
        // 将对象转为字符串作为消息内容
        messageContent = JSON.stringify(promptData);
      }
      
      logger.debug(`API请求消息内容: ${messageContent}`);
      
      // 使用聊天完成API接口
      let response;
      try {
        response = await tuziClient.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o-image-vip",
          messages: [
            {
              role: "user",
              content: messageContent
            }
          ],
          stream: false
        });
        
        logger.debug(`API完成响应: ${JSON.stringify(response).substring(0, 200)}...`);
      } catch (apiError) {
        logger.error(`API调用失败: ${apiError instanceof Error ? apiError.message : '未知错误'}`);
        // 如果是网络相关错误，重试
        if (apiError instanceof Error && 
           (apiError.message.includes('ECONNREFUSED') || 
            apiError.message.includes('ETIMEDOUT') || 
            apiError.message.includes('ENOTFOUND') ||
            apiError.message.includes('network') ||
            apiError.message.includes('connection'))) {
          throw new Error(`网络连接错误: ${apiError.message}`);
        }
        throw apiError; // 其他错误直接抛出
      }
      
      // 从聊天完成响应中提取图片URL
      if (response && response.choices && response.choices[0] && response.choices[0].message) {
        const assistantContent = response.choices[0].message.content || "";
        
        // 从响应中提取gen_id，以便后续修改图片使用
        const genIdMatch = assistantContent.match(/> gen_id: `([^`]+)`/);
        if (genIdMatch && genIdMatch[1]) {
          genId = genIdMatch[1];
          logger.info(`提取到gen_id: ${genId}`);
          
          // 保存gen_id到临时存储，确保在请求间保持一致
          try {
            // 使用全局变量保存genId，避免文件系统操作
            global._lastGenIds = global._lastGenIds || {};
            global._lastGenIds[JSON.stringify({ prompt, style, aspectRatio })] = genId;
            logger.info(`已保存gen_id到内存: ${genId}`);
          } catch (err) {
            logger.warn(`保存gen_id失败: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        
        // 检查生成进度
        const progressMatch = assistantContent.match(/> 进度 (\d+)%/);
        if (progressMatch && progressMatch[1]) {
          const progress = parseInt(progressMatch[1]);
          logger.info(`图片生成进度: ${progress}%`);
          
          // 每次接收到进度更新，记录时间戳
          const now = Date.now();
          global._lastProgressTime = global._lastProgressTime || {};
          const taskKey = genId || JSON.stringify({ prompt, style, aspectRatio });
          const lastTime = global._lastProgressTime[taskKey] || 0;
          global._lastProgressTime[taskKey] = now;
          
          // 关键修改：只有当进度小于100%时才等待，但不增加重试计数
          if (progress < 100) {
            // 根据上次进度更新时间动态调整等待时间
            // 如果最近有进度更新，等待较短时间；如果长时间无更新，等待较长时间
            const timeSinceLastUpdate = now - lastTime;
            const waitTime = timeSinceLastUpdate < 3000 ? 3000 : 
                            (timeSinceLastUpdate < 10000 ? 6000 : 10000);
            
            logger.info(`图片生成中，进度: ${progress}%，等待${waitTime/1000}秒继续...`);
            await delay(waitTime);
            continue; // 继续循环，但不增加重试计数
          }
        }
        
        // 检查生成完成标志
        const completedMatch = assistantContent.includes("生成完成 ✅");
        if (completedMatch) {
          logger.info("检测到生成完成标志");
        }
        
        // 从Markdown语法中提取图片URL
        const urlMatch = assistantContent.match(/!\[.*?\]\((.*?)\)/);
        if (urlMatch && urlMatch[1]) {
          logger.info(`成功从Markdown中提取图片URL`);
          
          // 清理临时上传的图片
          if (temporaryImageUrl) {
            try {
              await cleanupTemporaryImage(temporaryImageUrl);
              logger.info('已清理临时上传的图片');
            } catch (cleanupError) {
              logger.warn(`清理临时上传图片失败: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
            }
          }
          
          return { imageUrl: urlMatch[1], genId };
        }
        
        // 尝试从纯文本响应中提取URL
        const urlRegex = /(https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp))/i;
        const plainUrlMatch = assistantContent.match(urlRegex);
        if (plainUrlMatch && plainUrlMatch[1]) {
          logger.info(`成功从文本中提取图片URL`);
          return { imageUrl: plainUrlMatch[1], genId };
        }
        
        // 记录响应内容以便调试
        logger.info(`API响应内容: ${assistantContent.substring(0, 500)}...`);
        
        // 如果未能提取URL但是有生成ID，可能是中间状态，需要继续尝试
        if (genId) {
          logger.info(`有genId但未提取到图片URL，等待后继续请求: ${genId}`);
          await delay(5000); // 等待5秒
          continue; // 不增加重试计数，继续请求
        }
      }
      
      // 如果提取URL失败，尝试用简化的提示词重试
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        // 每次重试使用更直接的提示词
        currentPrompt = `请生成一张${style ? style + '风格的' : ''}图片${aspectRatio ? '，比例为' + aspectRatio : ''}`;
        logger.info(`第${retryCount}次重试，使用简化提示词: ${currentPrompt}`);
        await delay(RETRY_DELAY);
      } else {
        throw new Error("无法从API响应中提取图片URL");
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        logger.warn(`发生错误，第${retryCount}次重试，错误: ${lastError.message}`);
        // 使用更长的延迟
        await delay(RETRY_DELAY * 3);
      } else {
        throw lastError;
      }
    }
  }
  
  // 所有重试都失败，清理临时上传的图片
  if (temporaryImageUrl) {
    try {
      await cleanupTemporaryImage(temporaryImageUrl);
      logger.info('已清理临时上传的图片');
    } catch (cleanupError) {
      logger.warn(`清理临时上传图片失败: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    }
  }
  
  if (lastError) {
    throw lastError;
  } else {
    throw new Error('图像生成失败，达到最大重试次数');
  }
}

// 检查API连接性
async function checkApiConnectivity() {
  try {
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.tu-zi.com/v1';
    const urlObj = new URL(baseUrl);
    
    return new Promise<void>((resolve, reject) => {
      dns.lookup(urlObj.hostname, (err) => {
        if (err) {
          logger.error(`DNS解析失败: ${err.message}`);
          reject(new Error(`DNS解析失败: ${err.message}`));
          return;
        }
        
        const requestLib = urlObj.protocol === 'https:' ? https : http;
        const req = requestLib.request(
          {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: '/healthz',
            method: 'HEAD',
            timeout: 5000,
          },
          (res) => {
            logger.info(`API服务器连接成功，状态码: ${res.statusCode}`);
            resolve();
          }
        );
        
        req.on('error', (error) => {
          logger.error(`API服务器连接失败: ${error.message}`);
          reject(new Error(`API服务器连接失败: ${error.message}`));
        });
        
        req.on('timeout', () => {
          req.destroy();
          logger.error('API服务器连接超时');
          reject(new Error('API服务器连接超时'));
        });
        
        req.end();
      });
    });
  } catch (error) {
    logger.warn(`连接检查失败: ${error instanceof Error ? error.message : String(error)}`);
    // 连接检查失败不阻止主流程
  }
}

// 直接生成图像API - 按照tuzi-openai.md重写
export async function POST(request: NextRequest) {
  // 防止并发请求
  if (isProcessing) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: '系统正在处理另一个请求，请稍后再试' 
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  isProcessing = true;
  const startTime = Date.now();
  
  try {
    // 获取当前认证用户
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '用户未认证' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 解析请求体
    const body = await request.json();
    
    // 提取参数
    const { prompt, image, imagePath, style, aspectRatio, standardAspectRatio } = body;
    
    // 使用imagePath或image
    const imageContent = imagePath || image;
    
    // 初始化原始比例变量
    let originalAspectRatio: string | null = null;
    let useStandardRatio: string | null = standardAspectRatio || null;
    
    // 验证必要参数 - 允许有图片和风格但没有提示词的情况
    if ((!prompt || typeof prompt !== 'string' || prompt.trim() === '') && 
        (!imageContent || (style === "无风格" || !style))) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '提示词不能为空，或者需要上传图片并选择风格' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 记录请求参数，包括比例信息
    logger.debug(`用户 ${user.id} 请求生成图片，提示词: ${prompt ? prompt.substring(0, 30) : '无'}...${aspectRatio ? `, 比例: ${aspectRatio}` : ''}`);
    
    // 如果aspectRatio存在且格式正确，记录日志
    if (aspectRatio && typeof aspectRatio === 'string' && aspectRatio.includes(':')) {
      logger.info(`检测到图片比例: ${aspectRatio}`);
      originalAspectRatio = aspectRatio;
    }
    
    // 检查用户点数
    const { data: userCredits, error: creditsError } = await supabase
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', user.id)
      .single();
    
    if (creditsError) {
      logger.warn(`检查用户点数失败: ${creditsError.message}`);
      
      // 如果用户没有点数记录，创建一个初始记录
      if (creditsError.code === 'PGRST116') {
        const supabaseAdmin = await createAdminClient();
        await supabaseAdmin
          .from('ai_images_creator_credits')
          .insert({
            user_id: user.id,
            credits: 5, // 初始赠送5点
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          
        // 重新检查点数
        const { data: newUserCredits, error: newCreditsError } = await supabase
          .from('ai_images_creator_credits')
          .select('credits')
          .eq('user_id', user.id)
          .single();
          
        if (newCreditsError || !newUserCredits || newUserCredits.credits <= 0) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: '点数不足，无法生成图片' 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } else {
        return new Response(JSON.stringify({ 
          success: false, 
          error: '获取用户点数失败' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // 检查点数是否足够
    if (userCredits && userCredits.credits <= 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '点数不足，无法生成图片' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 扣除用户点数
    const supabaseAdmin = await createAdminClient();
    const { error: deductError } = await supabaseAdmin
      .from('ai_images_creator_credits')
      .update({
        credits: userCredits ? userCredits.credits - 1 : 4, // 如果没有点数记录，使用默认值4
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);
    
    if (deductError) {
      logger.error(`扣除用户点数失败: ${deductError.message}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: '扣除点数失败' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    logger.info(`已扣除用户 ${user.id} 的1个点数，开始生成图片`);
    
    try {
      // 处理图片内容 - 支持文件路径或base64
      let base64Image: string | null = null;
      let imageType: string = 'png';
      
      if (imageContent) {
        if (typeof imageContent === 'string' && (imageContent.startsWith('./') || imageContent.startsWith('/') || imageContent.startsWith('..'))) {
          // 文件路径处理
          if (fs.existsSync(imageContent)) {
            imageType = imageContent.split('.').pop() || 'jpg';
            base64Image = `data:image/${imageType};base64,${image2Base64(imageContent)}`;
            logger.info(`成功读取文件并转换为base64，文件类型: ${imageType}`);
          } else {
            logger.warn(`指定的文件路径不存在: ${imageContent}`);
          }
        } else if (typeof imageContent === 'string' && imageContent.startsWith('data:image/')) {
          // 已是base64编码的图片
          base64Image = imageContent;
          // 尝试从base64中提取图片类型
          const match = imageContent.match(/^data:image\/([a-zA-Z0-9]+);base64,/);
          if (match && match[1]) {
            imageType = match[1];
          }
          logger.info(`接收到base64编码图片，类型: ${imageType}`);
        } else {
          logger.warn(`不支持的图片内容格式: ${typeof imageContent}`);
        }
        
        // 如果有图片内容但解析失败
        if (!base64Image && imageContent) {
          logger.warn(`图片内容解析失败，将继续但不包含图片`);
        }
      }
      
      // 调用图资API创建图像
      const { imageUrl, genId } = await generateImage({
        prompt,
        base64Image,
        style,
        aspectRatio,
        useStandardRatio
      });
      
      // 保存历史记录
      saveGenerationHistory(user.id, prompt, imageUrl, style || null, originalAspectRatio || null, standardAspectRatio || null, genId);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      logger.info(`图片生成请求完成，总耗时: ${duration}ms`);
      
      // 返回结果
      return new Response(JSON.stringify({ 
        success: true,
        imageUrl: imageUrl,
        message: '图片生成成功',
        duration: duration
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      
    } catch (generationError) {
      // 图片生成过程中出错，退还点数
      logger.error(`图片生成过程失败: ${generationError instanceof Error ? generationError.message : String(generationError)}`);
      
      // 尝试退还用户点数
      try {
        const { data: userCredits } = await supabaseAdmin
          .from('ai_images_creator_credits')
          .select('credits')
          .eq('user_id', user.id)
          .single();
        
        if (userCredits) {
          await supabaseAdmin
            .from('ai_images_creator_credits')
            .update({
              credits: userCredits.credits + 1,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);
          
          logger.info(`已退还用户 ${user.id} 的1个点数`);
        }
      } catch (refundError) {
        logger.error(`尝试退还用户点数失败: ${refundError instanceof Error ? refundError.message : String(refundError)}`);
      }
      
      throw generationError;
    }
    
  } catch (error: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error(`图片生成失败，总耗时: ${duration}ms, 错误: ${error.message || String(error)}`);
    
    // 格式化错误信息
    let errorMessage = '生成图片时出错';
    if (error.message) {
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        errorMessage = '连接图资API服务器超时，请稍后再试';
      } else if (error.message.includes('rate limit')) {
        errorMessage = '图资API服务器繁忙，请稍后再试';
      } else if (error.message.includes('Unauthorized') || error.message.includes('invalid_api_key')) {
        errorMessage = 'API密钥无效，请联系管理员更新配置';
      } else {
        errorMessage = error.message;
      }
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage,
      duration: duration
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    // 无论成功失败，都释放锁
    isProcessing = false;
  }
}

// 保存生成历史到数据库，捕获但不传播错误
async function saveGenerationHistory(
  userId: string, 
  prompt: string, 
  imageUrl: string, 
  style: string | null = null, 
  aspectRatio: string | null = null, 
  standardAspectRatio: string | null = null,
  genId: string | null = null // 添加genId参数
) {
  try {
    const supabaseAdmin = await createAdminClient();
    const { error: historyError } = await supabaseAdmin
      .from('ai_images_creator_history')
      .insert({
        user_id: userId,
        prompt: prompt,
        image_url: imageUrl,
        // 检查数据库是否有style字段，如果不确定则不写入
        ...(style ? { style } : {}),
        // 添加图片比例字段，如果有的话
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        // 添加标准化比例字段
        ...(standardAspectRatio ? { standard_aspect_ratio: standardAspectRatio } : {}),
        // 添加生成ID，用于后续修改
        ...(genId ? { gen_id: genId } : {}),
        model_used: 'tuzi-gpt4o', // 记录使用的是图资API的GPT-4o
        created_at: new Date().toISOString()
      });
    
    if (historyError) {
      logger.warn(`保存生成历史失败: ${historyError.message}`);
    } else {
      logger.info(`成功保存生成历史记录${genId ? `，生成ID: ${genId}` : ''}${aspectRatio ? `，图片比例: ${aspectRatio}` : ''}${standardAspectRatio ? `，标准比例: ${standardAspectRatio}` : ''}`);
    }
  } catch (error) {
    logger.warn(`保存历史记录过程中出错: ${error instanceof Error ? error.message : String(error)}`);
    // 不抛出错误，保证主流程不受影响
  }
}

// 改进URL提取逻辑
function extractImageUrl(content: string): string | null {
  // 尝试从Markdown中提取图片URL (![alt](url) 格式)
  const markdownRegex = /!\[.*?\]\((.*?)\)/;
  const markdownMatch = content.match(markdownRegex);
  if (markdownMatch && markdownMatch[1]) {
    return markdownMatch[1];
  }

  // 尝试解析JSON
  try {
    const jsonData = JSON.parse(content);
        
    // 检查各种可能的URL字段名
    const possibleFields = ['image_url', 'imageUrl', 'url', 'image', 'generated_image'];
    
    for (const field of possibleFields) {
      if (jsonData[field] && typeof jsonData[field] === 'string' && 
          (jsonData[field].startsWith('http') || jsonData[field].startsWith('data:'))) {
        return jsonData[field];
      }
    }
  } catch (e) {
    // JSON解析失败，尝试正则表达式提取URL
    const urlRegex = /(https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp))/i;
    const match = content.match(urlRegex);
    if (match && match[0]) {
      return match[0];
    }
  }
  
    return null;
  }

// 声明全局变量类型
declare global {
  var _lastGenIds: Record<string, string>;
  var _lastProgressTime: Record<string, number>;
} 