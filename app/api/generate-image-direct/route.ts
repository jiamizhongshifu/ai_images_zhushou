import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { OpenAI } from 'openai';
import { getApiConfig } from '@/utils/env';
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
  const apiConfig = getApiConfig();
  
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
    const { prompt, image, imagePath, style } = body;
    
    // 使用imagePath或image
    const imageContent = imagePath || image;
    
    // 验证必要参数
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '提示词不能为空' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 记录请求参数
    logger.debug(`用户 ${user.id} 请求生成图片，提示词: ${prompt.substring(0, 30)}...`);
    if (imageContent) {
      if (typeof imageContent === 'string' && (imageContent.startsWith('./') || imageContent.startsWith('/') || imageContent.startsWith('..'))) {
        logger.debug(`包含图片路径: ${imageContent}`);
      } else {
        logger.debug(`包含base64图片，长度: ${typeof imageContent === 'string' ? imageContent.length : '未知'}`);
      }
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
        const supabaseAdmin = createAdminClient();
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
    const supabaseAdmin = createAdminClient();
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
            logger.warn(`文件不存在: ${imageContent}`);
            base64Image = null;
          }
        } else {
          // base64处理
          base64Image = addBase64Prefix(imageContent);
          if (base64Image.includes('data:image/')) {
            const match = base64Image.match(/data:image\/([a-zA-Z0-9]+);base64,/);
            if (match && match[1]) {
              imageType = match[1];
            }
          }
        }
      }
      
      // 准备消息内容 - 严格按照tuzi-openai.md的格式
      const messages: any[] = [{
        role: 'user',
        content: []
      }];
      
      // 如果有图片，添加图片内容
      if (base64Image) {
        messages[0].content.push({
          type: "image_url",
          image_url: {
            url: base64Image
          }
        });
      }
      
      // 添加文本提示
      messages[0].content.push({
        type: "text",
        text: prompt
      });
      
      logger.info('开始向图资API发送请求');
      
      // 获取环境配置
      const apiConfig = getApiConfig();
      // 使用环境变量中指定的模型，默认为gpt-4o-all
      const modelName = apiConfig.model || 'gpt-4o-all';
      
      // 创建流式响应
      const stream = await tuziClient.chat.completions.create({
        model: modelName,
        messages: messages,
        stream: true, // 使用流式响应
      });
      
      logger.info(`与图资API建立连接成功，开始接收数据流`);
      
      // 收集图片URL
      let imageUrl = '';
      const chunks = [];
      
      // 处理流数据
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          chunks.push(content);
          
          // 尝试从内容中提取图片URL
          if (content.includes('http') && content.includes('://') && !imageUrl) {
            // 使用更严格的URL匹配模式，避免包含括号等特殊字符
            const urlMatch = content.match(/(https?:\/\/[^\s'"()<>]+)/);
            if (urlMatch && urlMatch[1]) {
              // 清理URL，去除可能的结尾括号等特殊字符
              let extractedUrl = urlMatch[1];
              
              // 如果URL末尾有右括号但没有对应的左括号，则去除
              if (extractedUrl.endsWith(')') && !extractedUrl.includes('(')) {
                extractedUrl = extractedUrl.slice(0, -1);
              }
              
              // 移除任何URL末尾的非法字符
              extractedUrl = extractedUrl.replace(/[.,;:!?)]$/, '');
              
              imageUrl = extractedUrl;
              logger.info(`从流中提取到图片URL: ${imageUrl}`);
            }
          }
        }
      }
      
      // 如果没有从流中提取到URL，尝试从完整响应中提取
      if (!imageUrl) {
        const fullContent = chunks.join('');
        // 使用更严格的URL匹配模式
        const urlMatch = fullContent.match(/(https?:\/\/[^\s'"()<>]+)/);
        if (urlMatch && urlMatch[1]) {
          // 清理URL，去除可能的结尾括号等特殊字符
          let extractedUrl = urlMatch[1];
          
          // 如果URL末尾有右括号但没有对应的左括号，则去除
          if (extractedUrl.endsWith(')') && !extractedUrl.includes('(')) {
            extractedUrl = extractedUrl.slice(0, -1);
          }
          
          // 移除任何URL末尾的非法字符
          extractedUrl = extractedUrl.replace(/[.,;:!?)]$/, '');
          
          imageUrl = extractedUrl;
          logger.info(`从完整响应中提取到图片URL: ${imageUrl}`);
        } else {
          logger.warn(`未能从响应中提取图片URL`);
          throw new Error('未能提取图片URL');
        }
      }
      
      // 检查图片URL
      if (!imageUrl) {
        throw new Error('生成的图片URL为空');
      }
      
      // 保存历史记录
      saveGenerationHistory(user.id, prompt, imageUrl, style || null);
      
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
async function saveGenerationHistory(userId: string, prompt: string, imageUrl: string, style: string | null = null) {
  try {
    const supabaseAdmin = createAdminClient();
    const { error: historyError } = await supabaseAdmin
      .from('ai_images_creator_history')
      .insert({
        user_id: userId,
        prompt: prompt,
        image_url: imageUrl,
        // 检查数据库是否有style字段，如果不确定则不写入
        ...(style ? { style } : {}),
        model_used: 'tuzi-gpt4o', // 记录使用的是图资API的GPT-4o
        created_at: new Date().toISOString()
      });
    
    if (historyError) {
      logger.warn(`保存生成历史失败: ${historyError.message}`);
    } else {
      logger.info(`成功保存生成历史记录`);
    }
  } catch (error) {
    logger.warn(`保存历史记录过程中出错: ${error instanceof Error ? error.message : String(error)}`);
    // 不抛出错误，保证主流程不受影响
  }
} 