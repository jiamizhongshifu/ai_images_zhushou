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
import { uploadImageToStorage, cleanupTemporaryImage } from '../../../utils/image/uploadImageToStorage';
import { createLogger, createSafeSummary } from '../../../utils/logger';

// 定义TuziConfig类型
interface TuziConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  isConfigComplete: boolean;
}

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

// 创建专用日志记录器
const logger = createLogger('图片生成');

// 防止并发请求的锁
let isProcessing = false;

// 缓存图资支持的模型列表
let cachedTuziModels: string[] | null = null;

// 设置网络请求配置 - 调整为适配Vercel Pro的超时时间
const API_TIMEOUT = 270000; // 270秒，给Vercel平台留出30秒处理开销

// 延时函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 创建图资API客户端
function createTuziClient() {
  // 获取环境配置
  const apiConfig = getApiConfig('tuzi') as TuziConfig;
  
  // 优先使用环境变量中的配置
  const apiKey = apiConfig.apiKey || process.env.OPENAI_API_KEY;
  const baseURL = apiConfig.apiUrl || process.env.OPENAI_BASE_URL || "https://api.tu-zi.com/v1/chat/completions";
  
  logger.info(`创建图资API客户端，使用BASE URL: ${baseURL}，模型: ${process.env.OPENAI_MODEL || 'gpt-4o-image-vip'}，超时: ${API_TIMEOUT}ms`);
  
  // 返回配置的客户端 - 使用图资API
  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
    defaultQuery: { model: process.env.OPENAI_MODEL || 'gpt-4o-image-vip' },
    timeout: API_TIMEOUT
  });
}

// 内容政策违规检测结果类型
interface ContentPolicyViolation {
  detected: boolean;  // 是否检测到违规
  reason: string;     // 具体原因（用于日志）
  userMessage: string; // 给用户的友好提示
}

// 检查内容是否违反内容政策
function checkContentPolicyViolation(content: string): ContentPolicyViolation | null {
  // 常见的内容政策违规关键词
  const violationPatterns = [
    {
      pattern: /violates our content policies/i,
      reason: "内容政策违规",
      userMessage: "您的提示词可能含有不适当内容，请尝试更换描述方式"
    },
    {
      pattern: /unable to generate the image.*because/i,
      reason: "生成被拒绝",
      userMessage: "系统无法生成您请求的图像，请调整您的提示词"
    },
    {
      pattern: /sorry.*can't generate/i,
      reason: "拒绝生成",
      userMessage: "很抱歉，系统无法生成符合您描述的图像，请尝试更换描述"
    },
    {
      pattern: /not allowed to generate/i,
      reason: "不允许生成",
      userMessage: "您请求的图像类型不被允许生成，请尝试其他描述"
    },
    {
      pattern: /against our policy/i,
      reason: "违反政策",
      userMessage: "您的请求违反了内容政策，请避免敏感内容"
    },
    {
      pattern: /inappropriate content/i,
      reason: "不适当内容",
      userMessage: "您的提示词可能包含不适当内容，请修改"
    },
    {
      pattern: /我无法生成|无法为您生成|违反内容政策|内容审核|不适宜|不适合/,
      reason: "中文内容审核拒绝",
      userMessage: "您的提示词未通过内容审核，请尝试更换描述方式"
    }
  ];

  // 检查每个模式
  for (const { pattern, reason, userMessage } of violationPatterns) {
    if (pattern.test(content)) {
      return {
        detected: true,
        reason,
        userMessage
      };
    }
  }

  // 未检测到明确的违规内容
  return null;
}

// 提供提示词优化建议
function getSuggestionForPrompt(promptText: string, styleText: string | null): string {
  let suggestions: string[] = [];

  // 基于风格的特定建议
  if (styleText) {
    switch (styleText) {
      case "皮克斯":
        suggestions.push("尝试描述卡通场景或物体，而非真实人物");
        break;
      case "新海诚":
        suggestions.push("专注于风景和自然元素描述，避免详细的人物刻画");
        break;
      case "宫崎骏":
      case "吉卜力":
        suggestions.push("可以描述奇幻元素和自然风景，避免现实人物的详细描述");
        break;
      default:
        suggestions.push("尝试使用更抽象、艺术性的描述");
    }
  }

  // 针对可能的敏感词的建议
  if (/人物|男|女|儿童|父|母|男孩|女孩/.test(promptText)) {
    suggestions.push("避免详细描述真实人物特征，可以使用'卡通角色'或'动画形象'替代");
  }

  if (/武器|枪|刀|剑/.test(promptText)) {
    suggestions.push("避免描述武器，可以使用'奇幻道具'或'魔法物品'代替");
  }

  // 如果没有具体建议，提供通用建议
  if (suggestions.length === 0) {
    suggestions = [
      "使用更艺术化的描述",
      "专注于风景、自然或抽象概念",
      "使用更少的具体人物描述",
      "尝试描述情境或氛围，而非具体对象"
    ];
  }

  // 随机选择最多3条建议
  if (suggestions.length > 3) {
    const randomSuggestions: string[] = [];
    const indices = new Set<number>();
    while (indices.size < 3) {
      indices.add(Math.floor(Math.random() * suggestions.length));
    }
    indices.forEach(index => randomSuggestions.push(suggestions[index]));
    suggestions = randomSuggestions;
  }

  return `建议: ${suggestions.join("; ")}`;
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

// 添加getImageSize函数，根据纵横比返回合适的图像尺寸
function getImageSize(aspectRatio: string | null): "1024x1024" | "1792x1024" | "1024x1792" | "512x512" | "256x256" {
  if (!aspectRatio) return '1024x1024'; // 默认正方形
  
  // 标准尺寸对应表 - 只使用OpenAI支持的尺寸
  if (aspectRatio?.includes('16:9') || aspectRatio?.includes('1.78')) {
    return '1792x1024'; // 宽屏 16:9
  } else if (aspectRatio?.includes('9:16') || aspectRatio?.includes('0.56')) {
    return '1024x1792'; // 竖屏 9:16
  }
  
  // 如果是自定义比例，尝试解析并适配到最接近的标准尺寸
  try {
    if (aspectRatio?.includes(':')) {
      const [width, height] = aspectRatio.split(':').map(Number);
      const ratio = width / height;
      
      if (ratio > 1.2) return '1792x1024'; // 宽屏比例
      if (ratio < 0.8) return '1024x1792'; // 竖屏比例
      return '1024x1024'; // 接近正方形
    }
  } catch (e) {
    console.error('解析自定义比例失败:', e);
  }
  
  // 默认返回正方形
  return '1024x1024';
}

// 直接生成图像API - 按照tuzi-openai.md重写
export async function POST(request: NextRequest) {
  let useBackupStrategy = false; // 标记是否使用备用策略
  let timeoutChecker: NodeJS.Timeout | null = null;
  let isTimeoutWarned = false; // 添加回这个变量
  const startTime = Date.now();
  
  // 用于处理图片内容的变量
  let base64Image: string | null = null;
  let imageUrl: string | null = null; // 新增变量，用于存储上传到存储服务的图片URL
  let temporaryImageUrl: string | null = null; // 标记临时上传的图片URL，以便任务完成后清理

  try {
  // 防止并发请求
  if (isProcessing) {
      logger.warn('并发请求被阻止');
    return new Response(JSON.stringify({ 
      success: false, 
        error: '系统正在处理其他请求，请稍后再试' 
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
    // 设置并发锁
  isProcessing = true;
  
    // 设置超时监控
    timeoutChecker = setInterval(() => {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > 240000 && !isTimeoutWarned) { // 240秒(4分钟)时发出警告
        logger.warn(`请求执行时间已达到240秒，接近Vercel限制`);
        isTimeoutWarned = true;
        // 此时可以考虑激活降级策略
        useBackupStrategy = true;
      }
    }, 10000);

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
        
        // 将base64图片上传到存储服务，获取URL进行传递
        if (base64Image) {
          try {
            logger.info('开始将用户图片上传到存储服务');
            // 记录base64字符串的安全摘要，而不是完整长度
            logger.debug(`图片数据: ${createSafeSummary(base64Image)}`);
            
            imageUrl = await uploadImageToStorage(base64Image, user.id);
            temporaryImageUrl = imageUrl; // 标记为临时URL
            logger.info(`图片上传成功，获取到URL`);
          } catch (uploadError) {
            logger.warn(`上传图片失败: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
            // 使用安全摘要记录诊断信息，避免完整记录base64前缀
            logger.debug(`上传失败详情:`, {
              errorName: uploadError instanceof Error ? uploadError.name : 'Unknown',
              errorStack: uploadError instanceof Error ? (uploadError.stack ? uploadError.stack.split('\n')[0] : 'No stack') : 'No stack trace',
              hasBase64Data: !!base64Image,
              dataSize: base64Image ? Math.ceil(base64Image.length / 1024) + 'KB' : '0KB'
            });
            logger.info('将使用原始图片数据继续处理');
          }
        }
      }
      
      // 两阶段图像处理实现
      // 阶段1: 获取初始响应和gen_id
      // 阶段2: 使用gen_id处理用户图片

      logger.info('启动两阶段图像处理流程');
      
      // 阶段1: 获取gen_id
      // 构建初始消息
      const initialMessages: any[] = [
        {
          role: 'user',
          content: prompt
        }
      ];
      
      // 记录初始请求信息
      logger.info('阶段1: 发送初始请求获取gen_id');
      logger.debug(`初始提示词: ${prompt.substring(0, 100)}`);
      
      // 发送初始请求
      const initialResponse = await tuziClient.chat.completions.create({
        model: 'gpt-4o-image-vip',
        messages: initialMessages,
        stream: false,
        user: `${user.id}_init`
      });
      
      // 从响应中提取gen_id
      let genId: string | null = null;
      if (initialResponse?.choices?.[0]?.message?.content) {
        const content = initialResponse.choices[0].message.content;
        // 匹配gen_id格式
        const genIdMatch = content.match(/gen_id: `([^`]+)`/);
        if (genIdMatch && genIdMatch[1]) {
          genId = genIdMatch[1];
          logger.info(`成功获取gen_id: ${genId}`);
        } else {
          logger.warn('无法从初始响应中提取gen_id，将尝试继续但可能不成功');
          logger.debug(`响应内容前200字符: ${content.substring(0, 200)}`);
        }
      } else {
        logger.error('初始响应不包含有效内容');
        throw new Error('无法获取初始响应，请稍后重试');
      }
      
      // 确保图片已上传到存储服务获取URL
      if (base64Image && !imageUrl) {
        logger.info('上传用户图片到存储服务');
        try {
          imageUrl = await uploadImageToStorage(base64Image, user.id);
          temporaryImageUrl = imageUrl; // 标记为临时，以便后续清理
          logger.info('图片上传成功');
        } catch (uploadError) {
          logger.warn(`图片上传失败: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
          logger.info('将使用原始base64数据继续');
        }
      }
      
      // 阶段2: 使用gen_id处理用户图片
      // 构建编辑消息，包含完整的对话历史
      const editMessages: any[] = [
        // 包含第一阶段的完整对话
        ...initialMessages,
        {
          role: 'assistant',
          content: initialResponse.choices[0].message.content
        }
      ];
      
      // 创建编辑请求JSON结构
      const editRequestData: any = {
        prompt: prompt
      };
      
      // 检测提示词中是否包含比例相关指令
      const hasPortraitKeywords = prompt.match(/竖向|纵向|人像|垂直|长图|高图/i);
      const hasLandscapeKeywords = prompt.match(/横向|风景|宽屏|宽图/i);
      const hasSquareKeywords = prompt.match(/方形|正方形|1:1|等边/i);
      
      // 根据提示词中的关键词设置比例
      let detectedRatio: string | null = null;
      if (hasPortraitKeywords) {
        detectedRatio = "9:16";
        logger.info(`从提示词中检测到竖向指令，设置比例为: ${detectedRatio}`);
      } else if (hasLandscapeKeywords) {
        detectedRatio = "16:9";
        logger.info(`从提示词中检测到横向指令，设置比例为: ${detectedRatio}`);
      } else if (hasSquareKeywords) {
        detectedRatio = "1:1";
        logger.info(`从提示词中检测到方形指令，设置比例为: ${detectedRatio}`);
      }
      
      // 添加风格信息
      if (style && style !== "无风格") {
        editRequestData.prompt = `${style}风格: ${editRequestData.prompt}`;
      }
      
      // 优先级顺序: 
      // 1. 用户明确上传时指定的比例 (useStandardRatio/originalAspectRatio)
      // 2. 从提示词检测到的比例 (detectedRatio)
      // 3. 不设置比例参数，让API自行决定
      if (useStandardRatio || originalAspectRatio) {
        editRequestData.ratio = useStandardRatio || originalAspectRatio;
        logger.info(`使用显式指定的比例: ${editRequestData.ratio}`);
      } else if (detectedRatio) {
        editRequestData.ratio = detectedRatio;
        logger.info(`使用从提示词检测到的比例: ${editRequestData.ratio}`);
      }
      // 不再添加默认比例，让API自行决定
      
      // 添加gen_id
      if (genId) {
        editRequestData.gen_id = genId;
      }
      
      // 将editRequestData转换为代码块
      const formattedRequestData = "```\n" + JSON.stringify(editRequestData, null, 2) + "\n```";
      
      // 构建用户编辑消息
      const userEditContent: any[] = [];
      
      // 添加格式化的JSON请求
      userEditContent.push({
        type: "text",
        text: formattedRequestData
      });
      
      // 添加图片内容
      if (imageUrl || base64Image) {
        userEditContent.push({
          type: "image_url",
          image_url: {
            url: imageUrl || base64Image
          }
        });
      }
      
      // 添加用户编辑消息到对话历史
      editMessages.push({
        role: 'user',
        content: userEditContent
      });
      
      // 记录编辑请求信息
      logger.info('阶段2: 发送编辑请求');
      logger.debug(`编辑请求数据: ${JSON.stringify(editRequestData)}`);
      logger.debug(`对话历史消息数: ${editMessages.length}`);
      
      // 发送编辑请求
      const editResponse = await tuziClient.chat.completions.create({
        model: 'gpt-4o-image-vip',
        messages: editMessages,
        stream: false,
        user: `${user.id}_edit`,
        temperature: 0.1
      });
      
      // 从编辑响应中提取图片URL
      let resultImageUrl = '';
      if (editResponse?.choices?.[0]?.message?.content) {
        const content = editResponse.choices[0].message.content;
        
        // 尝试多种模式提取URL
        let urlMatch = content.match(/!\[.*?\]\((https:\/\/[^)]+)\)/); // Markdown格式
        
        if (!urlMatch) {
          // 尝试直接URL提取
          urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp))/i);
        }
        
        if (urlMatch && urlMatch[1]) {
          resultImageUrl = urlMatch[1];
          logger.info(`成功从编辑响应中提取图片URL`);
        } else {
          logger.error(`无法从编辑响应中提取图片URL: ${content.substring(0, 200)}...`);
          throw new Error('API返回的响应中不包含有效的图片URL');
        }
      } else {
        logger.error(`编辑响应不包含有效的消息内容`);
        throw new Error('API返回的响应格式不正确');
      }

      logger.info(`图像处理完成，总用时: ${(Date.now() - startTime)/1000}秒`);
      
      // 保存历史记录
      await saveGenerationHistory(user.id, prompt, resultImageUrl, style || null, originalAspectRatio || null, useStandardRatio || null);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      logger.info(`图片生成请求完成，总耗时: ${duration}ms (${duration/1000}秒)`);
      
      // 清理临时上传的图片
      if (temporaryImageUrl) {
        try {
          await cleanupTemporaryImage(temporaryImageUrl);
        } catch (cleanupError) {
          logger.warn(`清理临时上传图片失败: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }
      }
      
      // 返回结果
      return new Response(JSON.stringify({ 
        success: true,
        imageUrl: resultImageUrl,
        message: '图片生成成功',
        duration: duration,
        usedBackupStrategy: useBackupStrategy
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      
    } catch (generationError) {
      // 图片生成过程中出错，退还点数
      logger.error(`图片生成过程失败: ${generationError instanceof Error ? generationError.message : String(generationError)}, 已用时间: ${(Date.now() - startTime)/1000}秒`);
      
      // 如果错误与超时有关，并且尚未尝试降级策略，尝试使用备用模型重试
      if (!useBackupStrategy && 
          (generationError instanceof Error) && 
          (generationError.message.includes('timeout') || generationError.message.includes('time') || 
          (Date.now() - startTime) > 180000)) {
        
        logger.warn(`检测到可能的超时问题，尝试使用备用策略重试`);
        useBackupStrategy = true;
        
        // 使用提示词的简化版本
        const shortenedPrompt = prompt ? prompt.substring(0, Math.min(prompt.length, 1500)) : "生成图像";
        
        // 使用较快的模型重试
        let retryResponse: any;
        
        if (base64Image) {
          // 如果有上传图片，还是需要使用聊天API，但使用简化的提示词
          logger.info(`使用备用策略重试，包含上传图片 ${imageUrl ? '(通过URL)' : '(通过base64)'}`);
          
          // 重新构建消息但使用简化的提示词
          const backupMessages: any[] = [
            {
              role: 'system',
              content: [
                {
                  type: 'text',
                  text: '你是一个先进的图像生成系统，能够根据图片和文字提示生成图像。请精确保持参考图片中的主要内容、人物和场景，尽量不要改变背景或添加额外元素，除非提示词明确要求。'
                }
              ]
            },
            {
              role: 'user',
              content: []
            }
          ];
          
          // 添加图片内容
          backupMessages[1].content.push({
            type: "image_url",
            image_url: {
              url: imageUrl || base64Image // 优先使用URL，没有则使用base64
            }
          });
          
          // 添加文本内容
          backupMessages[1].content.push({
            type: "text",
            text: `${shortenedPrompt}`
          });
          
          try {
            // 使用聊天API调用
            const backupChatResponse = await tuziClient.chat.completions.create({
              model: 'gpt-4o-mini', // 使用更快的模型
              messages: backupMessages,
              stream: false,
              user: `${user.id}_retry`
            });
            
            // 从聊天完成响应中提取图片URL
            if (backupChatResponse && backupChatResponse.choices && backupChatResponse.choices[0] && backupChatResponse.choices[0].message) {
              const assistantContent = backupChatResponse.choices[0].message.content || "";
              
              // 从响应中提取URL
              const urlRegex = /(https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp))/i;
              const urlMatch = assistantContent.match(urlRegex);
              
              if (urlMatch && urlMatch[1]) {
                logger.info(`使用备用策略成功从聊天响应中提取图片URL`);
                retryResponse = {
                  data: [{ url: urlMatch[1] }]
                };
              } else {
                logger.error(`无法从备用策略聊天响应中提取图片URL: ${assistantContent.substring(0, 200)}...`);
                throw new Error('备用API返回的响应中不包含有效的图片URL');
              }
            } else {
              throw new Error('备用API返回的响应格式不正确');
            }
          } catch (backupError) {
            // 如果带图片的备用调用失败，退回到不带图片的gpt-4o-image-vip
            logger.warn(`带图片的备用策略失败，尝试使用备用模型: ${backupError instanceof Error ? backupError.message : String(backupError)}`);
            
            retryResponse = await tuziClient.images.generate({
              model: 'gpt-4o-image-vip', // 使用备用图像生成模型
              prompt: `${shortenedPrompt}`,
              n: 1,
              quality: "standard", // 使用标准质量提高速度
              size: "1024x1024", // 使用标准尺寸
              response_format: "url",
              user: `${user.id}_retry_backup`
            });
          }
        } else {
          // 没有上传图片，使用普通的备用模型
          retryResponse = await tuziClient.images.generate({
            model: 'gpt-4o-image-vip', // 使用备用图像生成模型
          prompt: shortenedPrompt, // 使用简化版提示词
          n: 1,
          quality: "standard", // 使用标准质量提高速度
          size: "1024x1024", // 使用标准尺寸
          response_format: "url",
          user: `${user.id}_retry`
        });
        }
        
        logger.info(`备用策略API响应接收完成，总用时: ${(Date.now() - startTime)/1000}秒`);
        
        if (retryResponse.data && retryResponse.data.length > 0 && retryResponse.data[0].url) {
          const resultImageUrl = retryResponse.data[0].url;
          logger.info(`使用备用策略成功生成图片: ${resultImageUrl}`);
          
          // 保存历史记录
          await saveGenerationHistory(user.id, prompt, resultImageUrl, style || null, originalAspectRatio || null, useStandardRatio || null);
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          // 清理临时上传的图片
          if (temporaryImageUrl) {
            try {
              await cleanupTemporaryImage(temporaryImageUrl);
            } catch (cleanupError) {
              logger.warn(`清理临时上传图片失败: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
            }
          }
          
          return new Response(JSON.stringify({ 
            success: true,
            imageUrl: resultImageUrl,
            message: '使用备用策略生成图片成功',
            duration: duration,
            usedBackupStrategy: true
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      
      // 尝试退还用户点数
      try {
        const supabaseAdmin = await createAdminClient();
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
      
      // 清理临时上传的图片
      if (temporaryImageUrl) {
        try {
          await cleanupTemporaryImage(temporaryImageUrl);
        } catch (cleanupError) {
          logger.warn(`清理临时上传图片失败: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }
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
    
    // 提取提示建议，如果错误信息中已包含则不重复添加
    let suggestion = '';
    if (!errorMessage.includes('建议:')) {
      // 尝试从URL查询参数获取prompt和style
      const { prompt = '', style = null } = (request as any).query || {}; 
      suggestion = getSuggestionForPrompt(prompt, style);
    }
    
    // 清理临时上传的图片
    if (temporaryImageUrl) {
      try {
        await cleanupTemporaryImage(temporaryImageUrl);
      } catch (cleanupError) {
        logger.warn(`清理临时上传图片失败: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage,
      suggestion: suggestion || undefined, // 只在有建议时添加
      duration: duration
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    // 清理超时检查器
    if (timeoutChecker) {
      clearInterval(timeoutChecker);
    }
    
    // 无论成功失败，都释放锁
    isProcessing = false;
  }
}

// 保存生成历史到数据库，捕获但不传播错误
async function saveGenerationHistory(userId: string, prompt: string, imageUrl: string, style: string | null = null, aspectRatio: string | null = null, standardAspectRatio: string | null = null) {
  try {
    // 历史记录最大存储数量
    const MAX_HISTORY_RECORDS = 100;
    
    const supabaseAdmin = await createAdminClient();
    
    // 检查用户当前历史记录数量
    const { count, error: countError } = await supabaseAdmin
      .from('ai_images_creator_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (countError) {
      logger.warn(`查询历史记录数量失败: ${countError.message}`);
    } else {
      logger.info(`用户 ${userId} 当前历史记录数量: ${count || 0}`);
      
      // 如果记录数量达到或超过最大限制，删除最早的记录
      if (count !== null && count >= MAX_HISTORY_RECORDS) {
        logger.info(`用户历史记录数量(${count})已达到最大限制(${MAX_HISTORY_RECORDS})，将删除最早的记录`);
        
        // 查询最早的记录
        const { data: oldestRecords, error: queryError } = await supabaseAdmin
          .from('ai_images_creator_history')
          .select('id')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(count - MAX_HISTORY_RECORDS + 1); // 删除超出限制的记录数量
        
        if (queryError) {
          logger.warn(`查询最早的历史记录失败: ${queryError.message}`);
        } else if (oldestRecords && oldestRecords.length > 0) {
          // 删除最早的记录
          const recordIds = oldestRecords.map(record => record.id);
          const { error: deleteError } = await supabaseAdmin
            .from('ai_images_creator_history')
            .delete()
            .in('id', recordIds);
          
          if (deleteError) {
            logger.warn(`删除最早的历史记录失败: ${deleteError.message}`);
          } else {
            logger.info(`成功删除 ${recordIds.length} 条最早的历史记录`);
          }
        }
      }
    }
    
    // 插入新的历史记录
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