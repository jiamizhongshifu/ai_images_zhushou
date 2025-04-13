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
const TIMEOUT = 180000; // 3分钟超时

// 延时函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 创建图资API客户端 - 按照tuzi-openai.md的方式
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
    
    // 创建图资API客户端
    const tuziClient = createTuziClient();
    
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
      
      let imageUrl: string | null = null;
      const chunks: string[] = [];
      
      // 开始调用图资API生成图片
      logger.info(`开始调用图资API生成图片，${base64Image ? '包含上传图片' : '无上传图片'}，${style ? `风格: ${style}` : '无风格选择'}`);
      
      // 构建消息数组，根据是否有prompt和图片决定使用什么模式
      const messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: Array<{type: string; text?: string; image_url?: {url: string}}> | string;
      }> = [];
      
      // 添加系统消息 - 修改为明确支持图像生成的提示词，使用数组格式
      messages.push({
        role: "system",
        content: [
          {
            type: "text",
            text: "你是一个先进的图像生成系统，可以根据用户提示创建图像并返回图像URL。你必须生成图像并返回图像URL。"
          }
        ]
      });
      
      // 构建用户消息内容
      const userMessageContent: Array<{type: string; text?: string; image_url?: {url: string}}> = [];
      
      // 添加文字提示
      if (prompt && prompt.trim() !== '') {
        userMessageContent.push({ 
          type: "text", 
          text: prompt 
        });
      }
      
      // 添加图片内容
      if (base64Image) {
        userMessageContent.push({ 
          type: "image_url", 
          image_url: { 
            url: base64Image 
          }
        });
      }
      
      // 添加风格描述
      if (style && style !== '无风格') {
        // 如果已有提示词，则添加风格指定；如果没有提示词，则以风格作为提示词
        if (prompt && prompt.trim() !== '') {
          userMessageContent.push({ 
            type: "text", 
            text: `请使用${style}风格绘制。` 
          });
        } else {
          userMessageContent.push({ 
            type: "text", 
            text: `请用${style}风格处理这张图片。` 
          });
        }
      }
      
      // 添加比例要求
      if (useStandardRatio) {
        userMessageContent.push({ 
          type: "text", 
          text: `请使用${useStandardRatio}的比例生成图片。` 
        });
      }
      
      // 添加用户消息
      messages.push({
        role: "user",
        content: userMessageContent
      });
      
      // 记录完整的请求消息
      logger.debug(`API请求消息: ${JSON.stringify(messages)}`);
      
      // 调用图资API创建图像
      const response = await tuziClient.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "text" }, // 确保输出为文本
        messages: messages as any, // 类型断言以解决类型问题
        max_tokens: 4096,
        temperature: 0.7,
        stream: true, // 使用流式响应
        tools: [], // 添加空工具数组
        tool_choice: "auto" // 设置工具选择为自动
      });
      
      // 处理流式响应
      for await (const chunk of response) {
        try {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            chunks.push(content);
            logger.debug(`收到流式响应片段: ${content.substring(0, 50)}...`);
            
            // 尝试从当前片段中提取URL
            const extractedUrl = extractUrlFromContent(content);
            if (extractedUrl && !imageUrl) {
              imageUrl = extractedUrl;
              logger.info(`从流式响应中提取到图片URL: ${imageUrl}`);
            }
          }
        } catch (chunkError) {
          logger.warn(`处理响应片段出错: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`);
        }
      }
      
      // 如果没有从流中提取到URL，尝试从完整响应中提取
      if (!imageUrl) {
        const fullContent = chunks.join('');
        const extractedUrl = extractUrlFromContent(fullContent);
        if (extractedUrl) {
          imageUrl = extractedUrl;
          logger.info(`从完整响应中提取到图片URL: ${imageUrl}`);
        } else {
          // 记录完整响应内容，帮助调试
          logger.warn(`未能从响应中提取图片URL，完整响应:`);
          logger.warn(fullContent.substring(0, 1000) + (fullContent.length > 1000 ? '...(已截断)' : ''));
          throw new Error('未能提取图片URL');
        }
      }
      
      // 保存历史记录
      saveGenerationHistory(user.id, prompt, imageUrl, style || null, originalAspectRatio || null, standardAspectRatio || null);
      
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
async function saveGenerationHistory(userId: string, prompt: string, imageUrl: string, style: string | null = null, aspectRatio: string | null = null, standardAspectRatio: string | null = null) {
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
        model_used: 'tuzi-gpt4o', // 记录使用的是图资API的GPT-4o
        created_at: new Date().toISOString()
      });
    
    if (historyError) {
      logger.warn(`保存生成历史失败: ${historyError.message}`);
    } else {
      logger.info(`成功保存生成历史记录${aspectRatio ? `，图片比例: ${aspectRatio}` : ''}${standardAspectRatio ? `，标准比例: ${standardAspectRatio}` : ''}`);
    }
  } catch (error) {
    logger.warn(`保存历史记录过程中出错: ${error instanceof Error ? error.message : String(error)}`);
    // 不抛出错误，保证主流程不受影响
  }
}

// 从API响应内容中提取URL
function extractUrlFromContent(content: string): string | null {
  try {
    // 尝试匹配常见URL模式
    const urlPatterns = [
      /(https?:\/\/[^\s'"()<>]+)/, // 基本URL
      /(https?:\/\/[^\s'"]+)/, // 更宽松的URL
      /\b(https?:\/\/\S+)/, // 非空格的URL
      /\[(https?:\/\/[^\]]+)\]/, // 方括号中的URL
      /"(https?:\/\/[^"]+)"/, // 双引号中的URL
      /'(https?:\/\/[^']+)'/, // 单引号中的URL
      /链接[:：]\s*(https?:\/\/\S+)/, // 中文标记的URL
      /URL[:：]\s*(https?:\/\/\S+)/, // URL标记
      /image:?\s*(https?:\/\/\S+)/, // image标记
      /源文件[地址链接]?[为是:：]\s*(https?:\/\/\S+)/ // 中文描述的图片URL
    ];
    
    // 尝试所有模式
    for (const pattern of urlPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        let extractedUrl = match[1].trim();
        
        // 记录匹配的模式和原始URL
        logger.info(`匹配到URL模式: ${pattern}, 原始URL: ${extractedUrl}`);
        
        // 清理URL
        if (extractedUrl.endsWith(')') && !extractedUrl.includes('(')) {
          extractedUrl = extractedUrl.slice(0, -1);
        }
        
        // 删除尾部特殊字符
        extractedUrl = extractedUrl.replace(/[.,;:!?)]$/, '');
        
        // 删除其他可能的无效字符
        extractedUrl = extractedUrl.replace(/["'<>{}]/, '');
        
        // 日志记录清理后的URL
        logger.info(`提取到URL: ${extractedUrl}`);
        
        // 返回清理后的URL
        return extractedUrl;
      }
    }
    
    // 如果没有找到URL，记录整个内容以便分析
    logger.warn(`无法从内容中提取URL，完整内容: ${content.substring(0, 500)}...`);
    return null;
  } catch (error) {
    logger.error(`URL提取过程中出错: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
} 