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
            
            try {
              // 尝试从文件中获取图片尺寸信息
              // 这里我们可以使用第三方库如sharp，但为了简化，我们使用一个通用处理方式
              logger.info("检测上传图片的原始比例");
              // 由于我们没有直接在服务端分析图片尺寸的能力，可以通过前端传递比例参数
            } catch (error) {
              logger.warn(`无法获取图片尺寸信息: ${error instanceof Error ? error.message : String(error)}`);
            }
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
            
            // 提取比例信息从请求参数
            if (body.aspectRatio) {
              originalAspectRatio = body.aspectRatio;
              logger.info(`从请求参数获取图片比例: ${originalAspectRatio}`);
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
      let finalPrompt = prompt;
      
      // 处理风格和比例
      const selectedStyle = style || "无风格";
      
      // 优先使用标准化的比例，如果有的话
      if (base64Image) {
        // 记录比例信息
        if (useStandardRatio) {
          logger.info(`使用标准化比例: ${useStandardRatio}`);
        } else if (originalAspectRatio) {
          logger.info(`使用原始比例: ${originalAspectRatio}`);
        }
        
        // 确定要使用的比例
        const ratioToUse = useStandardRatio || originalAspectRatio;
        
        if (ratioToUse) {
          // 从比例中提取宽高
          const [width, height] = ratioToUse.split(':').map(Number);
          
          if (selectedStyle === "皮克斯") {
            // 皮克斯风格特别处理
            finalPrompt = `${prompt}。请务必使用 ${ratioToUse} 的标准宽高比，生成宽 ${width} 高 ${height} 比例的图片。使用皮克斯风格。`;
            logger.info(`为皮克斯风格添加了标准比例要求: ${ratioToUse}`);
          } else {
            // 其他风格也添加比例信息，但用更柔和的方式
            finalPrompt = `${prompt}。请使用 ${ratioToUse} 的标准宽高比。`;
            logger.info(`为风格 ${selectedStyle} 添加了标准比例提示: ${ratioToUse}`);
          }
        }
      }
      
      messages[0].content.push({
        type: "text",
        text: finalPrompt
      });
      
      logger.info(`开始向图资API发送请求，最终提示词: ${finalPrompt.substring(0, 50)}...`);
      
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
