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
import crypto from 'crypto';
import { reportProgress, TaskStages } from '@/utils/updateTaskProgress';
import sharp from 'sharp';
import { uploadImageToStorage, ensureImageUrl } from '@/utils/image/uploadImageToStorage';

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

// 定义图片生成任务的接口
interface ImageGenerationTask {
  id: string;                    // 任务ID
  userId: string;               // 用户ID
  prompt: string;               // 提示词
  style?: string | null;        // 风格设置
  aspectRatio?: string | null;  // 宽高比
  standardAspectRatio?: string | null; // 标准宽高比
  model?: string;              // 使用的模型
  status: 'pending' | 'processing' | 'completed' | 'failed';  // 任务状态
  imageUrl?: string;           // 生成的图片URL
  error?: string;              // 错误信息
  progress?: number;           // 生成进度
  stage?: string;              // 当前阶段
  createdAt: string;           // 创建时间
  updatedAt: string;           // 更新时间
  fingerprint?: string;        // 请求指纹
  provider?: string;           // 服务提供商
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

// 设置API超时时间 - 调整为适配Vercel Pro的超时时间
const API_TIMEOUT = 120000; // 120秒，降低超时以避免接近Vercel限制

// 创建图资API客户端 - 按照tuzi-openai.md的方式
function createTuziClient() {
  // 获取环境配置
  const apiConfig = getApiConfig('tuzi') as TuziConfig;
  
  // 优先使用环境变量中的配置
  const apiKey = apiConfig.apiKey || process.env.OPENAI_API_KEY;
  // 修正API基础URL，去掉chat/completions路径
  const baseURL = (apiConfig.apiUrl || process.env.OPENAI_BASE_URL || "https://api.tu-zi.com/v1").replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');
  
  // 使用环境变量中的模型
  const imageModel = process.env.OPENAI_MODEL || "gpt-4o-image-vip"; 
  
  logger.info(`创建图资API客户端，使用BASE URL: ${baseURL}`);
  logger.debug(`API密钥状态: ${apiKey ? '已配置' : '未配置'} (长度: ${apiKey?.length || 0})`);
  logger.debug(`使用图像生成模型: ${imageModel}`);
  
  if (!apiKey) {
    logger.error('API密钥未配置，请检查环境变量OPENAI_API_KEY');
    throw new Error('API密钥未配置');
  }
  
  // 设置API超时时间 - 使用优化后的超时设置
  const apiTimeout = API_TIMEOUT;
  logger.debug(`API超时设置: ${apiTimeout}ms (${apiTimeout/1000}秒)`);
  
  // 设置API最大重试次数
  const maxRetries = 2; // 设置固定的重试次数
  logger.debug(`API最大重试次数: ${maxRetries}次`);
  
  // 返回配置的客户端以及模型配置
  return {
    client: new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
      timeout: apiTimeout,
      maxRetries: maxRetries,
      defaultHeaders: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
      }
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
    
    // 使用环境变量中的模型名称
    const modelUsed = process.env.OPENAI_MODEL || 'gpt-4o-image-vip';
    
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
  
  // 添加兔子API特定的提取模式
  const tuziPatterns = [
    // 兔子API格式: ![gen_01....](https://...)
    /!\[(gen_[a-zA-Z0-9_]+)\]\((https?:\/\/[^\s)]+)\)/i,
    // gen_id 格式提取
    /> gen_id: `([^`]+)`/i,
    // 生成完成标记后的URL
    /> 生成完成 ✅[^!]*!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i,
  ];
  
  // 先尝试兔子API特定模式
  for (const pattern of tuziPatterns) {
    const match = content.match(pattern);
    if (match) {
      // 根据模式类型提取URL
      if (pattern.toString().includes('gen_id')) {
        // 这种情况我们找到了gen_id，但需要进一步查找对应的URL
        const genId = match[1];
        logger.debug(`找到gen_id: ${genId}，继续寻找对应的图片URL`);
        
        // 查找与genId相关的图片URL
        const urlMatch = content.match(new RegExp(`!\\[${genId}\\]\\((https?:\\/\\/[^\\s)]+)\\)`, 'i'));
        if (urlMatch && urlMatch[1]) {
          logger.debug(`找到gen_id ${genId}对应的URL: ${urlMatch[1]}`);
          return urlMatch[1];
        }
      } else if (match[2] && match[2].startsWith('http')) {
        // 这种情况直接找到了URL (第二个捕获组)
        logger.debug(`使用兔子API特定模式提取到URL: ${match[2]}`);
        return match[2];
      } else if (match[1] && match[1].startsWith('http')) {
        // 这种情况直接找到了URL (第一个捕获组)
        logger.debug(`使用兔子API特定模式提取到URL: ${match[1]}`);
        return match[1];
      }
    }
  }
  
  // 常规模式 - 保留原有逻辑
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
    // JSON格式中的URL
    /"url"\s*:\s*"(https?:\/\/[^"]+)"/i,
    // 常见图片服务商域名
    /(https?:\/\/[^\s"'<>]+(?:openai\.com|cloudfront\.net|imgix\.net|googleapis\.com|googleusercontent\.com|bing\.com|tu-zi\.com|cdn\.openai\.com|azureedge\.net|storage\.googleapis\.com|s3\.amazonaws\.com)[^\s"'<>]*)/i,
    // 带有filesystem.site的URL
    /(https?:\/\/[^\s"'<>]*filesystem\.site[^\s"'<>]*)/i,
    // 任何URL (最后尝试)
    /(https?:\/\/[^\s"'<>]+)/i
  ];
  
  // 清理内容 - 移除JSON格式相关字符，保留纯文本
  const cleanedContent = content
      .replace(/\\"/g, '"')     // 处理转义的引号
      .replace(/\\n/g, ' ')     // 处理换行符
      .replace(/\\r/g, ' ')     // 处理回车符
      .replace(/\\t/g, ' ');    // 处理制表符
  
  // 逐个尝试各种模式
  for (const pattern of patterns) {
    const match = cleanedContent.match(pattern);
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
    
    // 不进行重试，删除原有重试逻辑
  } catch (error) {
    logger.error(`触发点数更新事件失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// 验证图片数据格式 - 增强版
function validateImageData(imageData: string): boolean {
  try {
    // 基本格式检查
    if (!imageData || typeof imageData !== 'string') {
      logger.error('图片数据无效：为空或非字符串');
      return false;
    }
    
    logger.debug(`开始验证图片数据: ${formatImageDataForLog(imageData)}`);
    
    // 检查前缀 - 标准验证
    if (!imageData.startsWith('data:image/')) {
      logger.error('图片数据格式错误: 缺少有效的data:image前缀');
      return false;  // 更严格的验证，要求必须有正确前缀
    }

    // 验证data URL格式
    const dataUrlRegex = /^data:(image\/[a-z]+);base64,/i;
    const match = imageData.match(dataUrlRegex);
    
    if (!match) {
      logger.error('图片数据格式不符合标准data URL格式');
      return false;
    }
    
    const mimeType = match[1].toLowerCase();
    logger.debug(`检测到MIME类型: ${mimeType}`);
    
    // 检查是否为支持的MIME类型
    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!supportedTypes.includes(mimeType)) {
      logger.warn(`检测到不常见的MIME类型: ${mimeType}, 但将继续处理`);
    }
    
    // 拆分并验证base64部分
    const parts = imageData.split(',');
    if (parts.length !== 2) {
      logger.error(`图片数据格式错误: 无法正确拆分base64部分, 找到${parts.length}个部分`);
      return false;
    }
    
      const base64Part = parts[1].trim();
    
    // 验证base64部分
    if (!base64Part || base64Part.length < 100) {
      logger.error(`base64部分异常: 长度=${base64Part.length}`);
        return false;
      }
      
    // 检查base64字符是否有效
    const validBase64Regex = /^[A-Za-z0-9+/=]+$/;
    // 只检查前1000和最后100个字符，避免检查整个大字符串
    const headPart = base64Part.substring(0, 1000);
    const tailPart = base64Part.substring(base64Part.length - 100);
    
    if (!validBase64Regex.test(headPart) || !validBase64Regex.test(tailPart)) {
      logger.error('base64部分包含无效字符');
      return false;
    }
    
    // 尝试解码部分数据验证base64编码的有效性
    try {
      // 只解码前1KB和最后100字节进行测试
      const testParts = [
        base64Part.substring(0, 1024),
        base64Part.substring(base64Part.length - 100)
      ];
      
      for (const testPart of testParts) {
      const buffer = Buffer.from(testPart, 'base64');
        if (buffer.length <= 0) {
          logger.error(`base64解码异常: 解码后长度为${buffer.length}`);
          return false;
        }
      }
      
      // 如果是JPEG，检查JPEG文件头(SOI: 0xFF, 0xD8)
      if (mimeType === 'image/jpeg') {
        const testBuffer = Buffer.from(base64Part.substring(0, 100), 'base64');
        if (testBuffer.length >= 2 && (testBuffer[0] !== 0xFF || testBuffer[1] !== 0xD8)) {
          logger.warn('JPEG数据缺少正确的文件头标记(SOI)，但将继续处理');
        }
      }
      
      // 如果是PNG，检查PNG文件头
      if (mimeType === 'image/png') {
        const testBuffer = Buffer.from(base64Part.substring(0, 100), 'base64');
        if (testBuffer.length >= 8 && 
            (testBuffer[0] !== 0x89 || testBuffer[1] !== 0x50 || 
             testBuffer[2] !== 0x4E || testBuffer[3] !== 0x47)) {
          logger.warn('PNG数据缺少正确的文件头标记，但将继续处理');
        }
      }
      
      logger.info(`图片数据验证通过: ${formatImageDataForLog(imageData)}`);
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

// 添加一个用于处理图片日志的工具函数
function formatImageDataForLog(imageData: string): string {
  if (!imageData) return 'null';
  
  // 获取MIME类型
  const mimeMatch = imageData.match(/^data:(image\/[^;]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'unknown';
  
  // 计算base64部分的长度
  const base64Length = imageData.split(',')[1]?.length || 0;
  
  // 返回格式化的信息
  return `[${mimeType}, ${(base64Length / 1024).toFixed(1)}KB]`;
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
    // 记录开始时间
    const startTime = Date.now();
    logger.info(`开始通知任务${taskId}状态更新为${status}`);
    
    // 获取环境变量
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const secretKey = process.env.TASK_PROCESS_SECRET_KEY;
    
    // 构建请求URL
    const notifyUrl = `${siteUrl}/api/task-notification`;
    
    // 准备请求数据
    const notifyData = {
      taskId,
      status,
      imageUrl,
      error,
      source: 'generate-image-task'
    };
    
    // 设置请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secretKey}`
    };
    
    // 先直接更新数据库，确保即使通知失败数据也已更新
    try {
      logger.info(`优先直接更新任务${taskId}状态到数据库`);
      
      const supabaseAdmin = await createAdminClient();
      
      // 根据状态更新数据库
      if (status === 'completed' && imageUrl) {
        await supabaseAdmin
          .from('image_tasks')
          .update({
            status: 'completed',
            image_url: imageUrl,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('task_id', taskId);
          
        logger.info(`直接更新任务${taskId}状态为completed成功`);
      } else if (status === 'failed') {
        await supabaseAdmin
          .from('image_tasks')
          .update({
            status: 'failed',
            error_message: error || '未知错误',
            updated_at: new Date().toISOString()
          })
          .eq('task_id', taskId);
          
        logger.info(`直接更新任务${taskId}状态为failed成功`);
      } else {
        await supabaseAdmin
          .from('image_tasks')
          .update({
            status: status,
            updated_at: new Date().toISOString()
          })
          .eq('task_id', taskId);
          
        logger.info(`直接更新任务${taskId}状态为${status}成功`);
      }
    } catch (dbError) {
      logger.error(`直接更新任务${taskId}状态到数据库失败: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      // 继续尝试通知，不中断流程
    }
    
    // 执行通知请求 - 现在作为次要手段
    const MAX_RETRIES = 1; // 修改为1，表示不进行重试，只尝试一次
    let lastError = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // 如果不是首次尝试，添加延迟
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          logger.info(`尝试第${attempt + 1}次通知任务${taskId}状态更新`);
        }
        
        // 发送通知请求
        const response = await fetch(notifyUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(notifyData),
          // 设置超时
          signal: AbortSignal.timeout 
            ? AbortSignal.timeout(10000) 
            : new AbortController().signal
        });
        
        // 检查响应
        if (!response.ok) {
          throw new Error(`通知请求失败: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // 通知成功
        logger.info(`任务${taskId}状态通知成功，耗时: ${Date.now() - startTime}ms`);
        return true;
      } catch (error) {
        // 记录错误
        lastError = error;
        logger.warn(`通知任务${taskId}状态失败(尝试${attempt + 1}/${MAX_RETRIES}): ${error instanceof Error ? error.message : String(error)}`);
        
        // 最后一次尝试失败
        if (attempt === MAX_RETRIES - 1) {
          logger.warn(`通过API通知任务${taskId}状态更新失败，但数据库已直接更新`);
        }
      }
    }
    
    // 所有通知尝试都失败，但数据库已更新，仍算成功
    return true;
  } catch (error) {
    logEnhancedError('通知任务状态更新失败', error, taskId);
    return false;
  }
}

// 创建图像URL验证函数
function isValidImageUrl(url: string): boolean {
  // 验证URL格式
  try {
    // 必须是有效的URL
    const parsedUrl = new URL(url);
    
    // 记录URL信息辅助调试
    logger.debug(`验证图片URL: ${url}`);
    logger.debug(`URL组成部分: 协议=${parsedUrl.protocol}, 主机=${parsedUrl.hostname}, 路径=${parsedUrl.pathname}`);
    
    // 必须是HTTP或HTTPS
    if (!parsedUrl.protocol.startsWith('http')) {
      logger.error(`URL协议不是http或https: ${parsedUrl.protocol}`);
    return false;
  }
    
    // 检查常见图片服务商域名
    const knownImageDomains = [
      'openai.com', 'cloudfront.net', 'imgix.net', 'googleapis.com', 
      'googleusercontent.com', 'bing.com', 'tu-zi.com', 'cdn.openai.com', 
      'azureedge.net', 'storage.googleapis.com', 's3.amazonaws.com',
      'filesystem.site', 'cloudflare.com', 'cdn.tuzi.chat', 'cdn.openai.com',
      'iili.io', 'imgbb.com'
    ];
    
    // 如果是已知图片服务商，直接通过
    for (const domain of knownImageDomains) {
      if (parsedUrl.hostname.includes(domain)) {
        logger.debug(`检测到已知图片服务域名: ${domain}`);
        return true;
      }
    }
    
    // 多层次的检查 - 优先级从高到低
    
    // 1. 路径以常见图片扩展名结尾
    if (/\.(jpe?g|png|gif|webp|svg|bmp|avif|tiff?)($|\?)/i.test(parsedUrl.pathname)) {
      logger.debug(`URL包含常见图片扩展名: ${parsedUrl.pathname}`);
      return true;
    }
    
    // 2. 路径包含常见图片相关路径
    if (/\/images?\//i.test(parsedUrl.pathname) || 
        /\/(image|picture|photo|generated-image|file|content|media|asset|upload|cdn|gallery)/i.test(parsedUrl.pathname)) {
      logger.debug(`URL包含图片相关路径: ${parsedUrl.pathname}`);
      return true;
    }
    
    // 3. URL参数包含图片相关标识
    if (/[?&](image|img|picture|photo|file|media)=/i.test(parsedUrl.search)) {
      logger.debug(`URL参数包含图片相关参数: ${parsedUrl.search}`);
      return true;
    }
    
    // 4. 域名特征判断
    if (/\b(img|image|photo|pic|static|media|assets|upload)\b/i.test(parsedUrl.hostname)) {
      logger.debug(`URL域名含有图片相关关键词: ${parsedUrl.hostname}`);
      return true;
    }
    
    // 5. 如果URL非常长并且没有明显图片特征，可能不是图片URL
    if (url.length > 300 && !url.includes('image') && !url.includes('photo') && !url.includes('picture')) {
      logger.warn(`URL过长且无图片特征，可能不是图片URL: ${url.substring(0, 100)}...`);
      return false;
    }
    
    // 如果达到这里，我们无法确定是否为有效的图片URL，但仍然允许通过
    logger.warn(`无法确定URL是否为图片，但允许通过: ${url}`);
    return true;
    
  } catch (error) {
    // URL无效
    logger.error(`URL格式无效: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// 在findAspectRatioParameters函数之后添加新函数，用于将比例转换为模型所需的尺寸描述
function getAspectRatioDescription(aspectRatio: string, standardAspectRatio?: string | null): string {
  if (!aspectRatio) return '';
  
  const [width, height] = aspectRatio.split(':').map(Number);
  let description = `宽高比为${width}:${height}`;
  
  if (standardAspectRatio) {
    description += `（标准比例：${standardAspectRatio}）`;
  }
  
  // 添加具体尺寸描述
  if (standardAspectRatio) {
    if (standardAspectRatio.includes('16:9') || standardAspectRatio.includes('4:3') || standardAspectRatio.includes('3:2')) {
      description += `，应为横向图片，推荐尺寸1792x1024或类似的宽屏比例`;
    } else if (standardAspectRatio.includes('9:16') || standardAspectRatio.includes('3:4') || standardAspectRatio.includes('2:3')) {
      description += `，应为竖向图片，推荐尺寸1024x1792或类似的竖屏比例`;
    } else if (standardAspectRatio.includes('1:1')) {
      description += `，应为正方形图片，推荐尺寸1024x1024`;
    }
  }
  
  return description;
}

// 优化计算请求指纹函数
function calculateRequestFingerprint(
  userId: string,
  prompt: string,
  style?: string | null,
  aspectRatio?: string | null,
  imageHash?: string | null, // 添加图片哈希特征
): string {
  // 缩短时间窗口为1分钟，使相同请求1分钟内被识别为重复请求
  const timeWindow = Math.floor(Date.now() / (1 * 60 * 1000));
  
  // 构建一个包含请求关键参数的对象
  const fingerprintData = {
    userId,
    prompt: prompt?.trim(),
    style: style || '',
    aspectRatio: aspectRatio || '',
    // 使用图片哈希特征而非是否存在图片
    imageHash: imageHash || '',
    timeWindow
  };
  
  // 计算MD5哈希作为指纹
  return crypto
    .createHash('md5')
    .update(JSON.stringify(fingerprintData))
    .digest('hex');
}

// 计算图片哈希特征，简化版的感知哈希
function calculateImageHash(imageBase64: string): string {
  try {
    if (!imageBase64) return '';
    
    // 为了简化计算，我们只使用base64的前10000字符进行哈希计算
    // 实际生产中可能需要更复杂的算法来比较图片相似性
    const sample = imageBase64.substring(0, 10000);
    return crypto.createHash('md5').update(sample).digest('hex');
  } catch (error) {
    // 修复参数数量问题
    logger.error(`计算图片哈希失败: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

// 修改检查重复请求函数
async function checkDuplicateRequest(
  supabase: any,
  userId: string,
  fingerprint: string
): Promise<{isDuplicate: boolean, existingTaskId?: string}> {
  try {
    // 仅查询最近3分钟内相同指纹的任务
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    
    const { data: existingTasks, error } = await supabase
      .from('image_tasks')
      .select('id, task_id, status, created_at')
      .eq('user_id', userId)
      .eq('request_fingerprint', fingerprint)
      .in('status', ['pending', 'processing'])
      .gt('created_at', threeMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      logger.warn(`检查重复请求失败: ${error.message}`);
      return { isDuplicate: false };
    }
    
    if (existingTasks && existingTasks.length > 0) {
      const taskCreatedAt = new Date(existingTasks[0].created_at);
      const elapsedSeconds = Math.floor((Date.now() - taskCreatedAt.getTime()) / 1000);
      
      logger.info(`检测到重复请求，已存在处理中的任务: ${existingTasks[0].task_id}，创建于${elapsedSeconds}秒前`);
      
      return { 
        isDuplicate: true, 
        existingTaskId: existingTasks[0].task_id 
      };
    }
    
    return { isDuplicate: false };
  } catch (err) {
    logger.error(`检查重复请求出错: ${err instanceof Error ? err.message : String(err)}`);
    return { isDuplicate: false };
  }
}

// 在文件合适位置添加进度解析函数
/**
 * 从OpenAI响应中解析进度信息
 * @param content 响应内容
 * @returns 进度信息或null
 */
function parseProgressFromContent(content: string): { progress: number, stage: string } | null {
  // 匹配兔子API格式的进度
  // 例如: "> 进度 14%." 或 "> 进度 74%."
  const tuziProgressRegex = /> 进度 (\d+)%/;
  const tuziProgressMatch = content.match(tuziProgressRegex);
  
  if (tuziProgressMatch && tuziProgressMatch[1]) {
    const progressValue = parseInt(tuziProgressMatch[1], 10);
    if (!isNaN(progressValue)) {
      return { 
        progress: progressValue, 
        stage: TaskStages.GENERATING
      };
    }
  }
  
  // 匹配兔子API的状态信息
  if (content.includes('> 排队中')) {
    return { progress: 5, stage: TaskStages.QUEUING };
  }
  
  if (content.includes('> 生成中')) {
    return { progress: 15, stage: TaskStages.GENERATING };
  }
  
  if (content.includes('> 生成完成 ✅')) {
    return { progress: 100, stage: TaskStages.COMPLETED };
  }
  
  // 原来的进度解析逻辑作为后备
  const progressRegex = />🏃‍ 进度 (\d+)\.\./;
  const progressMatch = content.match(progressRegex);
  
  if (progressMatch && progressMatch[1]) {
    const progressValue = parseInt(progressMatch[1], 10);
    if (!isNaN(progressValue)) {
      return { 
        progress: progressValue, 
        stage: TaskStages.GENERATING
      };
    }
  }
  
  // 匹配替代进度格式
  const altProgressRegex = /(\d+)%|进度 (\d+)|当前进度：(\d+)|progress: (\d+)/i;
  const altMatch = content.match(altProgressRegex);
  
  if (altMatch) {
    const progressValue = parseInt(altMatch[1] || altMatch[2] || altMatch[3] || altMatch[4], 10);
    if (!isNaN(progressValue)) {
      return { 
        progress: progressValue, 
        stage: TaskStages.GENERATING
      };
    }
  }
  
  // 匹配排队状态
  if (content.includes('🕐 排队中')) {
    return { progress: 5, stage: TaskStages.QUEUING };
  }
  
  // 匹配生成中状态
  if (content.includes('⚡ 生成中')) {
    return { progress: 15, stage: TaskStages.GENERATING };
  }
  
  return null;
}

// 添加比例验证函数
async function validateImageRatio(imageUrl: string, task: ImageGenerationTask): Promise<boolean> {
  try {
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dimensions = await sharp(buffer).metadata();
    
    if (!dimensions.width || !dimensions.height) {
      return false;
    }

    const actualRatio = dimensions.width / dimensions.height;
    
    // 根据任务要求判断比例是否正确
    if (task.aspectRatio === 'vertical') {
      // 竖向图片，期望高度大于宽度，比例约为2:3或3:4
      return actualRatio < 0.75; // 允许最大宽高比为3:4
    } else if (task.aspectRatio === 'horizontal') {
      // 横向图片，期望宽度大于高度，比例约为3:2或4:3
      return actualRatio > 1.3; // 要求最小宽高比为4:3
    } else {
      // 正方形图片
      const tolerance = 0.05;
      return Math.abs(actualRatio - 1) <= tolerance;
    }
  } catch (error) {
    logger.error(`验证图片比例时出错: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// 添加函数用于将复杂比例转换为标准比例
function getStandardRatio(ratio: string): string {
  if (!ratio) return "1:1";
  
  // 如果已经是标准格式(如 "1:1")，直接返回
  if (/^\d+:\d+$/.test(ratio)) return ratio;
  
  // 如果是"vertical"/"horizontal"格式，转换为标准比例
  if (ratio === "vertical") return "3:4";
  if (ratio === "horizontal") return "4:3";
  
  // 如果是如"4284:5712"的精确比例，简化为最接近的标准比例
  const parts = ratio.split(':');
  if (parts.length === 2) {
    const w = parseInt(parts[0]);
    const h = parseInt(parts[1]);
    if (!isNaN(w) && !isNaN(h)) {
      const r = w / h;
      // 根据比例返回最接近的标准比例
      if (r > 1.3) return "4:3"; // 横向
      if (r < 0.8) return "3:4"; // 竖向
      return "1:1";             // 接近正方形
    }
  }
  
  // 默认返回1:1
  return "1:1";
}

// 计算重试延迟时间(指数退避)
function calculateRetryDelay(attempt: number): number {
  const baseDelay = 2000; // 基础延迟 2 秒
  const maxDelay = 10000; // 最大延迟 10 秒
  const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  return delay;
}

// 判断是否需要重试
function shouldRetry(error: unknown): boolean {
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests')
    );
  }
  return false;
}

// 处理重试逻辑
async function handleRetry(
  taskId: string,
  currentAttempt: number,
  maxAttempts: number,
  attemptError: unknown,
  retryFn: () => Promise<any>
): Promise<any> {
  const errorMsg = attemptError instanceof Error ? attemptError.message : String(attemptError);
  
  if (currentAttempt >= maxAttempts || !shouldRetry(attemptError)) {
    logger.error(`任务 ${taskId} 达到最大重试次数或不满足重试条件`);
    throw new Error(`最终失败: ${errorMsg}`);
  }

  const delay = calculateRetryDelay(currentAttempt);
  logger.warn(`任务 ${taskId} 第 ${currentAttempt} 次重试失败, ${delay}ms 后重试: ${errorMsg}`);
  
  // 记录详细错误信息到数据库
  try {
    await createAdminClient()
      .from('image_tasks')
      .update({ error_message: errorMsg })
      .eq('id', taskId);
  } catch (dbError) {
    logger.error(`更新错误信息到数据库失败: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
  }

  await new Promise(resolve => setTimeout(resolve, delay));
  return retryFn();
}

// 添加getStandardSize函数
function getStandardSize(ratio: string): "1024x1024" | "1792x1024" | "1024x1792" {
  const [width, height] = ratio.split(':').map(Number);
  const aspectRatio = width / height;
  
  if (aspectRatio > 1.3) {
    return "1792x1024"; // 横向
  } else if (aspectRatio < 0.7) {
    return "1024x1792"; // 竖向
  }
  return "1024x1024"; // 正方形
}

// 主API处理函数，优化为监控执行时间和支持降级策略
export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  let timeoutChecker: NodeJS.Timeout | null = null;
  let isTimeoutWarned = false;
  let useBackupStrategy = false;
  
  try {
    // 设置超时监控
    timeoutChecker = setInterval(() => {
      const elapsedTime = Date.now() - requestStartTime;
      if (elapsedTime > 240000 && !isTimeoutWarned) { // 240秒(4分钟)时发出警告
        logger.warn(`请求执行时间已达到240秒，接近Vercel限制`);
        isTimeoutWarned = true;
        // 此时可以考虑激活降级策略
        useBackupStrategy = true;
      }
    }, 10000);
    
    logger.debug(`开始验证用户身份...`);
    
    // 检查请求大小
    const sizeCheck = await checkRequestSize(request);
    if (!sizeCheck.isValid) {
      logger.warn(`请求大小检查失败: ${sizeCheck.error}`);
      return NextResponse.json({ success: false, error: sizeCheck.error }, { status: 413 });
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
    
    // 计算图片哈希特征
    const imageHash = image ? calculateImageHash(image) : '';
    
    // 生成请求指纹并检查重复请求
    const requestFingerprint = calculateRequestFingerprint(
      currentUser.id, 
      prompt, 
      style, 
      aspectRatio,
      imageHash
    );
    
    // 检查是否存在相同请求
    const { isDuplicate, existingTaskId } = await checkDuplicateRequest(
      supabase,
      currentUser.id,
      requestFingerprint
    );
    
    // 如果是重复请求，直接返回已存在的任务ID
    if (isDuplicate && existingTaskId) {
      logger.info(`检测到重复请求，返回已存在的任务ID: ${existingTaskId}`);
      
      // 创建Admin客户端
      const supabaseAdmin = await createAdminClient();
      
      // 增加重复请求的日志记录
      try {
        // 记录重复请求
        await supabaseAdmin
          .from('duplicate_requests')
          .insert({
            user_id: currentUser.id,
            original_task_id: existingTaskId,
            fingerprint: requestFingerprint,
            created_at: new Date().toISOString()
          });
      } catch (logError) {
        // 记录失败不影响主流程
        logger.warn(`记录重复请求失败: ${logError}`);
      }
      
      return NextResponse.json({
        taskId: existingTaskId,
        status: 'duplicate',
        message: '检测到相同的请求正在处理中，继续使用已存在的任务'
      }, { status: 200 });
    }
    
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
          aspect_ratio: aspectRatio || null,
          provider: 'tuzi',
          model: process.env.OPENAI_MODEL || 'gpt-4o-image-vip',
          request_id: taskId,
          attempt_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          request_fingerprint: requestFingerprint // 保存请求指纹
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
        const tuziClient = createTuziClient();
        
        // 记录开始时间
        const startTime = Date.now();
        logger.info(`开始处理图像，任务ID: ${taskId}，使用模型: ${tuziClient.imageModel}`);
        logger.debug(`环境变量OPENAI_IMAGE_MODEL: ${process.env.OPENAI_IMAGE_MODEL || '未设置'}`);
        logger.debug(`环境变量OPENAI_MODEL: ${process.env.OPENAI_MODEL || '未设置'}`);
        
        // 定义消息结构
        let messages: ChatCompletionMessageParam[] = [];
        
        // 获取图片尺寸比例参数
        let size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024"; // 默认尺寸
        
        // 根据请求参数和提示词确定合适的尺寸
        if (aspectRatio) {
          // 根据实际图片比例决定输出尺寸
          logger.info(`检测到图片比例: ${aspectRatio}`);
          
          // 从aspectRatio中提取宽高比例
          const [width, height] = aspectRatio.split(':').map(Number);
          const ratio = width / height;
          
          // 确保始终基于实际比例选择合适的输出尺寸
          if (ratio > 1) { // 宽大于高
            size = "1792x1024"; // 宽屏比例
            logger.info(`根据宽高比(${ratio.toFixed(2)})选择宽屏尺寸: ${size}`);
          } else if (ratio < 1) { // 高大于宽
            size = "1024x1792"; // 竖屏比例
            logger.info(`根据宽高比(${ratio.toFixed(2)})选择竖屏尺寸: ${size}`);
          } else {
            logger.info(`根据宽高比(${ratio.toFixed(2)})选择正方形尺寸: ${size}`);
          }
        }
        // 记录比例信息
        if (aspectRatio) {
          logger.info(`图片比例参数: aspectRatio=${aspectRatio}, standardAspectRatio=${standardAspectRatio || '未指定'}`);
        }
        
        // 构建提示词
        let finalPrompt = '';
        if (style) {
          const { generatePromptWithStyle } = await import('@/app/config/styles');
          finalPrompt = generatePromptWithStyle(style, prompt || "生成图像");
          logger.info(`使用风格配置模板构建提示词，风格: ${style}, 长度=${finalPrompt.length}字符`);
        } else {
          finalPrompt = prompt || "生成图像";
        }
        
        // 添加比例指令
        if (aspectRatio) {
          const [width, height] = aspectRatio.split(':').map(Number);
          const ratio = width / height;
          
          if (ratio > 1) {
            finalPrompt += `，生成横向图片`;
          } else if (ratio < 1) {
            finalPrompt += `，生成竖向图片`;
          } else {
            finalPrompt += `，生成正方形图片`;
          }
        }

        // 处理图片数据
        let imageData = null;
        let inputImageUrl = null; // 改名为inputImageUrl避免与后续的imageUrl冲突

        if (image) {
          // 首先尝试将图片转换为URL格式
          try {
            logger.info('尝试将图片转换为URL格式以优化传输');
            inputImageUrl = await ensureImageUrl(image, currentUser.id);
            
            if (inputImageUrl) {
              logger.info(`图片成功转换为URL: ${inputImageUrl.substring(0, 60)}...`);
              // 转换成功后，不再使用base64
              imageData = null;
              
              // 记录到数据库
              try {
                await supabaseAdmin
                  .from('image_tasks')
                  .update({
                    input_image_url: inputImageUrl,
                    updated_at: new Date().toISOString()
                  })
                  .eq('task_id', taskId);
                logger.info('图片URL已记录到数据库');
              } catch (dbError) {
                logger.warn(`记录图片URL到数据库失败: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
              }
            } else {
              logger.info('无法将图片转换为URL，将使用base64格式');
              // 仍然使用原始的base64格式
          if (image.startsWith('data:image/')) {
            imageData = image;
          } else {
            const mimeType = 'image/jpeg';
            imageData = `data:${mimeType};base64,${image}`;
              }
            }
          } catch (uploadError) {
            logger.warn(`图片URL转换失败: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
            // 转换失败，使用原始base64
            if (image.startsWith('data:image/')) {
              imageData = image;
            } else {
              const mimeType = 'image/jpeg';
              imageData = `data:${mimeType};base64,${image}`;
            }
          }
          
          // 验证图片数据
          if (!inputImageUrl && (!imageData || imageData.length < 100)) {
            throw new Error('图片数据无效');
          }
        }
        
        logger.info(`图片处理：使用${style ? '风格配置模板' : '原始'}提示词，长度=${finalPrompt.length}字符`);
        
        // 构建单一用户消息 - 单一内容项
        messages = [{
          role: 'user',
          content: finalPrompt
        }];
        
        logger.debug(`构建消息完成，消息数组长度: ${messages.length}`);
        logger.debug(`消息内容项目数: 1`); // 固定为1
        
        // 记录最终提示词内容
        logger.info(`最终提示词: "${finalPrompt}"`);
        
        // 图像生成参数
        const quality = "hd"; // 使用高清质量，提高输出图像质量
        
        // 使用gpt-4o通过聊天API生成图像
        logger.info(`使用聊天API (${process.env.OPENAI_MODEL || 'gpt-4o-image-vip'})生成图片`);
        
        // 添加API请求开始时间记录
        const apiRequestStartTime = Date.now();
        
        // 执行API调用前验证消息结构
        if (messages.length < 1) {
          logger.error('消息数组中缺少用户消息，无法进行API调用');
          throw new Error('消息结构不完整，缺少用户消息');
        }
        
        // 确保用户消息包含必要的内容
        const userMessage = messages.find(msg => msg.role === 'user');
        if (!userMessage) {
          logger.error('无法找到用户消息');
          throw new Error('消息结构错误，缺少用户消息');
        }
        
        // 支持字符串格式的消息内容
        if (typeof userMessage.content === 'string') {
          if (!userMessage.content.trim()) {
            logger.error('用户消息内容为空');
            throw new Error('消息内容不能为空');
          }
          logger.info('消息结构验证通过，包含用户文本提示词');
        } 
        // 支持数组格式的消息内容
        else if (Array.isArray(userMessage.content)) {
          // 确保有文本内容
          const hasTextContent = userMessage.content.some(item => item.type === 'text');
          if (!hasTextContent) {
            logger.error('用户消息中缺少文本提示');
            throw new Error('消息格式错误，缺少文本提示');
          }
          
          // 如果有图片，确保消息中包含图片
          if (image) {
            const hasImageContent = userMessage.content.some(item => item.type === 'image_url');
            if (!hasImageContent) {
              logger.error('用户消息中缺少图片数据');
              throw new Error('图片数据丢失，请重新上传图片');
            }
            logger.info('消息结构验证通过，包含用户图片数据和提示词');
          } else {
            logger.info('消息结构验证通过，包含用户提示词');
          }
        }
        // 不支持其他格式
        else {
          logger.error('用户消息内容格式不支持');
          throw new Error('消息格式错误，内容格式不支持');
        }
        
        // 重要：在执行API调用前，将任务状态从pending更新为processing
        try {
          const { error: statusUpdateError } = await supabaseAdmin
                  .from('image_tasks')
                  .update({
                    status: 'processing',
                    updated_at: new Date().toISOString()
                  })
                  .eq('task_id', taskId);
                
          if (statusUpdateError) {
            logger.error(`更新任务状态为processing失败: ${statusUpdateError.message}`);
            // 继续执行，不中断流程，但记录错误
          } else {
            logger.stateChange(taskId, 'pending', 'processing');
            logger.info(`已更新任务状态为processing, 任务ID: ${taskId}`);
          }
        } catch (statusError) {
          logger.error(`更新任务状态异常: ${statusError instanceof Error ? statusError.message : String(statusError)}`);
          // 继续执行，不中断流程
        }
              
        // 定义重试逻辑所需的变量
        const MAX_RETRY_ATTEMPTS = 3; // 增加到3次重试机会
        let currentAttempt = 0;
        let lastError = null;
        
        // 定义重试延迟计算函数
        const calculateRetryDelay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 10000);
        
        // 定义错误类型判断函数
        const shouldRetryError = (error: any): boolean => {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return (
            errorMsg.includes('timeout') || 
            errorMsg.includes('超时') ||
            errorMsg.includes('rate limit') ||
            errorMsg.includes('too many requests') ||
            errorMsg.includes('服务暂时不可用') ||
            errorMsg.includes('network error') ||
            errorMsg.includes('connection') ||
            errorMsg.includes('socket')
          );
        };
        
        // 保存原始参数，确保重试时能够使用
        const originalParams = {
          aspectRatio: aspectRatio,
          standardAspectRatio: standardAspectRatio,
          size: size,
          finalPrompt: finalPrompt,
          style: style
        };
        
        // 定义变量存储当前使用的参数，以便在重试时更新
        let currentAspectRatio = aspectRatio;
        let currentStandardAspectRatio = standardAspectRatio;
        let currentSize = size;
        let currentFinalPrompt = finalPrompt;
        
        // 使用主方法 - 兔子API聊天接口生成图像
        logger.info('尝试使用兔子API聊天接口生成图像');
        
          // 重试逻辑
          while (currentAttempt <= MAX_RETRY_ATTEMPTS) {
            try {
              if (currentAttempt > 0) {
              const delay = calculateRetryDelay(currentAttempt);
              logger.info(`进行第${currentAttempt}次重试，等待${delay/1000}秒后重试，任务ID: ${taskId}`);
              await new Promise(resolve => setTimeout(resolve, delay));
                
              // 更新数据库中的尝试次数和详细信息
                await supabaseAdmin
                  .from('image_tasks')
                  .update({
                    attempt_count: currentAttempt,
                  last_error: lastError ? String(lastError).substring(0, 500) : null,
                  retry_count: currentAttempt,
                    updated_at: new Date().toISOString()
                  })
                  .eq('task_id', taskId);
              }
              
              // 设置超时处理
            const API_TIMEOUT = 120000; // 120秒，降低超时以避免接近Vercel限制
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                  reject(new Error(`API请求超时，超过${API_TIMEOUT/1000}秒未响应`));
                }, API_TIMEOUT);
              });
              
            // 定义附加数据，可能包含参考图片ID
            const additionalData = {
              gen_id: null as string | null // 如果有参考图片，这里会有值
            };
            
            // 检查是否需要处理参考图片
            if (image) {
              // 检查数据库是否有此图片的gen_id
              try {
                const { data: existingImage, error: imageError } = await supabase
                  .from('image_generation_references')
                  .select('gen_id')
                  .eq('image_hash', imageHash)
                  .eq('user_id', currentUser.id)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .single();
                
                if (existingImage && existingImage.gen_id) {
                  // 使用已存在的gen_id
                  logger.info(`找到参考图片的gen_id: ${existingImage.gen_id}`);
                  additionalData.gen_id = existingImage.gen_id;
                } else {
                  logger.info('未找到参考图片的gen_id，图片将通过prompt描述传递');
                }
              } catch (genIdError) {
                logger.warn(`检查参考图片gen_id失败: ${genIdError instanceof Error ? genIdError.message : String(genIdError)}`);
              }
            }
            
            // 将提示词和比例信息格式化为JSON对象
            const requestPayload: {
              prompt: string;
              ratio: string;
              gen_id?: string; // 可选的参考图片ID
            } = {
              prompt: finalPrompt,
              ratio: aspectRatio ? getStandardRatio(aspectRatio) : "1:1"
            };
            
            // 如果有参考图片的gen_id，添加到请求中
            if (additionalData.gen_id) {
              requestPayload.gen_id = additionalData.gen_id;
              logger.info(`添加参考图片gen_id到请求: ${additionalData.gen_id}`);
            }
            
            logger.info(`构建兔子API请求参数: ${JSON.stringify(requestPayload)}`);
            
            // 当使用参考图片时，需要特殊处理消息内容
            let apiMessages: {role: 'user' | 'system' | 'assistant'; content: any}[] = [];

            // 添加system message指导模型行为
            const systemMessage: {role: 'system'; content: string} = {
              role: 'system',
              content: '请严格按照用户的原始提示词生成图像，不要扩展、重写或修改提示词。保持用户意图的原始性。'
            };

            if (additionalData.gen_id) {
              // 如果有参考图片ID，使用JSON格式传递
              const jsonContent = JSON.stringify(requestPayload);
              apiMessages = [
                systemMessage,
                {
                  role: 'user',
                  content: jsonContent
                }
              ];
              logger.info(`使用JSON格式传递参考图片gen_id: ${jsonContent}`);
            } else if ((inputImageUrl || imageData)) {
              // 用户上传了图片但没有gen_id，使用数组格式传递图片数据
              apiMessages = [
                systemMessage,
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: finalPrompt
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: inputImageUrl || imageData // 优先使用URL格式
                      }
                    }
                  ]
                }
              ];
              // 根据使用的格式记录不同的日志
              if (inputImageUrl) {
                logger.info(`使用多模态格式传递图片URL和提示词: URL=${inputImageUrl.substring(0, 60)}..., 提示词="${finalPrompt}"`);
              } else {
              logger.info(`使用多模态格式传递图片数据和提示词: ${formatImageDataForLog(imageData)}, 提示词="${finalPrompt}"`);
              }
            } else {
              // 没有参考图片，只使用文本提示词
              apiMessages = [
                  systemMessage,
                  {
                    role: 'user',
                    content: finalPrompt // 直接使用原始提示词，不添加前缀
                  }
              ];
              logger.info(`使用标准文本格式传递提示词: ${finalPrompt}`);
            }
            
            // 修改为使用images.generate接口
            const apiOptions = {
              model: process.env.OPENAI_MODEL || 'gpt-4o-image-vip',
              prompt: finalPrompt,
              n: 1,
              size: aspectRatio ? getStandardSize(aspectRatio) : "1024x1024",
              quality: "hd" as const,
              response_format: "url" as const,
              style: "vivid" as const
            };

            logger.info(`API请求选项: ${JSON.stringify(apiOptions, null, 2)}`);
            
            // 使用images.generate接口
            const apiPromise = tuziClient.client.images.generate(apiOptions);
            
            logger.info(`使用兔子API的images.generate接口`);
              
            // 增强API参数日志记录
            const ratio = aspectRatio ? getStandardRatio(aspectRatio) : "1:1";
            
            logger.info(`详细API调用参数：
- 模型: ${process.env.OPENAI_MODEL || 'gpt-4o-image-vip'}
- 提示词: "${finalPrompt}"
- 比例: "${ratio}"
- 质量: "hd"
${inputImageUrl ? `- 上传图片URL: ${inputImageUrl.substring(0, 60)}...` : ''}
${image && !inputImageUrl ? `- 上传图片信息: ${formatImageDataForLog(image)}` : ''}
            `);
            
            // 创建响应分析对象用于跟踪处理进度和结果
            let responseAnalysis = {
              taskId: null as string | null,              // 任务ID
              genId: null as string | null,               // 生成ID
              jsonComplete: false,       // JSON部分是否完成 
              imageUrl: null as string | null,            // 图片URL
              firstChunk: null as string | null,          // 第一个非空内容
              lastChunk: null as string | null,           // 最后一个内容
              totalChunks: 0,            // 总内容块数
              progressUpdates: [] as Array<{ progress: number, stage: string }>,       // 进度更新列表
              fullContent: '',           // 累积的完整内容
            };
              
              // 竞争：API调用 vs 超时
            const response = await Promise.race([
                apiPromise,
                timeoutPromise
            ]) as any; // 使用any类型避免类型错误
              
            logger.info(`请求成功发送，等待响应...`);
              logger.timing(apiRequestStartTime, `API请求发送完成`);
              
            // 设置初始处理阶段，告知前端开始处理
            reportProgress(taskId, 20, TaskStages.PROCESSING);
            
            // 处理流式响应
            let resultImageUrl: string | null = null; // 重命名为resultImageUrl，避免与之前的imageUrl冲突
            
            // 详细记录响应对象信息以便调试
            logger.debug(`响应对象类型: ${typeof response}, 属性: ${Object.keys(response).join(', ')}`);
            if (response.constructor && response.constructor.name) {
              logger.debug(`响应构造函数名称: ${response.constructor.name}`);
            }
            
            // 处理结构化的Stream响应
            if (response && typeof response[Symbol.asyncIterator] === 'function') {
              logger.info('检测到可迭代的流式响应，开始处理...');
              
              try {
                // 使用for await...of循环处理异步迭代器
                for await (const chunk of response) {
                  try {
                    // 检查chunk结构并提取content
                    let content = '';
                    
                    if (chunk.choices && chunk.choices[0]?.delta?.content) {
                      content = chunk.choices[0].delta.content;
                      responseAnalysis.fullContent += content;
                      logger.debug(`收到内容片段: ${content.substring(0, 50)}...`);
                      
                      // 提取进度信息
                  const progressInfo = parseProgressFromContent(content);
                  if (progressInfo) {
                    logger.info(`检测到进度更新: ${progressInfo.progress}%, 阶段: ${progressInfo.stage}`);
                        responseAnalysis.progressUpdates.push(progressInfo);
                    reportProgress(taskId, progressInfo.progress, progressInfo.stage);
                  }
                  
                      // 检查是否包含生成完成标记
                      if (content.includes('生成完成') || content.includes('✅')) {
                        logger.info('检测到生成完成标记，准备提取图片URL');
                      }
                      
                      // 尝试从响应片段中提取图片URL (Markdown格式)
                      const markdownImageMatch = responseAnalysis.fullContent.match(/!\[.*?\]\((https:\/\/.*?)\)/);
                      if (markdownImageMatch && markdownImageMatch[1]) {
                        resultImageUrl = markdownImageMatch[1].trim();
                        logger.info(`从Markdown格式中提取到图片URL: ${resultImageUrl}`);
                        break; // 找到URL后退出循环
                      }
                      
                      // 检查是否包含gen_id信息
                      if (content.includes('gen_id:') || content.includes('gen_id：')) {
                        const genIdMatch = content.match(/gen_id:?\s*`([^`]+)`/);
                        if (genIdMatch && genIdMatch[1]) {
                          responseAnalysis.genId = genIdMatch[1];
                          logger.info(`提取到生成ID: ${responseAnalysis.genId}`);
                        }
                      }
                    } else {
                      logger.debug('收到不包含内容的chunk');
                    }
                  } catch (chunkError) {
                    logger.warn(`处理响应块时出错: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`);
                  }
                }
                
                logger.info('流式响应处理完成');
                
                // 如果流式处理中没有找到URL，尝试从完整内容中提取
                if (!resultImageUrl && responseAnalysis.fullContent) {
                  // 先尝试Markdown格式
                  const markdownImageMatch = responseAnalysis.fullContent.match(/!\[.*?\]\((https:\/\/.*?)\)/);
                  if (markdownImageMatch && markdownImageMatch[1]) {
                    resultImageUrl = markdownImageMatch[1].trim();
                    logger.info(`从完整内容的Markdown格式中提取到图片URL: ${resultImageUrl}`);
                  } else {
                    logger.warn(`未从Markdown格式中找到图片URL，尝试其他提取方法`);
                    
                    // 尝试提取任何URL
                    const urlMatch = responseAnalysis.fullContent.match(/https?:\/\/[^\s")]+/);
                    if (urlMatch && urlMatch[0]) {
                      resultImageUrl = urlMatch[0].trim();
                      logger.info(`从完整内容中提取到URL: ${resultImageUrl}`);
                    } else {
                      // 最后使用通用方法
                      const extractedUrl = extractImageUrl(responseAnalysis.fullContent);
                      if (extractedUrl) {
                        resultImageUrl = extractedUrl;
                        logger.info(`使用通用方法从完整内容中提取到URL: ${resultImageUrl}`);
                      } else {
                        logger.error(`所有提取方法均未找到有效的图片URL`);
                      }
                    }
                  }
                }
              } catch (streamError) {
                logger.error(`流式处理过程中出错: ${streamError instanceof Error ? streamError.message : String(streamError)}`);
              }
            } else {
              logger.warn(`响应没有body属性，无法读取流式响应`);
              
              // 尝试不同方法读取响应
              try {
                if (response && typeof response.text === 'function') {
                  const responseText = await response.text();
                  logger.debug(`使用text()方法获取的响应: ${responseText.substring(0, 200)}...`);
                  responseAnalysis.fullContent = responseText;
                  
                  // 从文本响应中提取URL
                  const markdownImageMatch = responseText.match(/!\[.*?\]\((https:\/\/.*?)\)/);
                  if (markdownImageMatch && markdownImageMatch[1]) {
                    resultImageUrl = markdownImageMatch[1].trim();
                    logger.info(`从文本响应中提取到Markdown格式图片URL: ${resultImageUrl}`);
                  } else {
                    const urlMatch = responseText.match(/https?:\/\/[^\s")]+/);
                    if (urlMatch && urlMatch[0]) {
                      resultImageUrl = urlMatch[0].trim();
                      logger.info(`从文本响应中提取到普通URL: ${resultImageUrl}`);
                    }
                  }
                }
              } catch (textError) {
                logger.error(`尝试读取响应文本失败: ${textError instanceof Error ? textError.message : String(textError)}`);
              }
            }
            
            // 清理提取的URL
                  if (resultImageUrl) {
              // 移除URL中可能的引号或多余字符
              resultImageUrl = resultImageUrl.replace(/["']/g, '');
              
              // 处理URL中可能的转义字符
              if (resultImageUrl.includes('\\')) {
                resultImageUrl = resultImageUrl.replace(/\\/g, '');
                logger.info(`清理URL中的转义字符`);
              }
              
              // 去除尾部的括号或标点
              resultImageUrl = resultImageUrl.replace(/[).,;}]+$/, '');
              
              logger.info(`清理后的最终URL: ${resultImageUrl}`);
            } else {
              logger.error(`未能提取到任何URL，原内容: ${responseAnalysis.fullContent.substring(0, 200)}`);
              }
              
              // 如果找到有效的图像URL，更新任务状态并返回
              if (resultImageUrl && isValidImageUrl(resultImageUrl)) {
                logger.info(`成功提取有效的图片URL: ${resultImageUrl}`);
                
                // 更新任务状态为成功
                try {
                  const { error: updateError } = await supabaseAdmin
                  .from('image_tasks')  // 修改为正确的表名
                    .update({
                      status: 'completed',
                      provider: 'tuzi',
                      image_url: resultImageUrl,
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
                
                // 记录生成历史
              await saveGenerationHistory(createAdminClient(), currentUser.id, resultImageUrl, currentFinalPrompt, originalParams.style, currentAspectRatio, currentStandardAspectRatio)
                  .catch(historyError => 
                    logger.error(`记录生成历史失败: ${historyError instanceof Error ? historyError.message : String(historyError)}`)
                  );
                
                // 记录图像结果与原始参数的对比
                logger.info(`图像生成结果分析:
- 生成的图片URL: ${resultImageUrl.substring(0, 50)}...
- 比例参数: aspectRatio=${currentAspectRatio || '未指定'}, standardAspectRatio=${currentStandardAspectRatio || '未指定'}
- 目标尺寸: ${currentSize}
- 使用风格: ${originalParams.style || '未指定'}
- API响应耗时: ${Date.now() - apiRequestStartTime}ms
- 总处理耗时: ${Date.now() - startTime}ms
                `);
                
                // 发送任务完成通知
              try {
                await notifyTaskUpdate(taskId, 'completed', resultImageUrl)
                  .catch(async (notifyError) => {
                    logger.error(`发送任务完成通知失败: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`);
                    
                    // 如果第一次通知失败，尝试使用另一种方式进行通知
                    logger.info(`尝试使用备用方式发送完成通知...`);
                    
                    // 延迟重试通知
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    try {
                      // 使用备用通知机制
                      const notifyUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/task-notification`;
                      const notifyResponse = await fetch(notifyUrl, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${process.env.INTERNAL_API_KEY || 'internal-api'}`
                        },
                        body: JSON.stringify({
                          taskId,
                          status: 'completed',
                          imageUrl: resultImageUrl,
                          timestamp: Date.now()
                        })
                      });
                      
                      if (notifyResponse.ok) {
                        logger.info(`备用通知发送成功`);
                      } else {
                        logger.warn(`备用通知发送失败: ${notifyResponse.status} ${notifyResponse.statusText}`);
                      }
                    } catch (backupError) {
                      logger.error(`备用通知失败: ${backupError instanceof Error ? backupError.message : String(backupError)}`);
                    }
                  });
              } catch (notificationError) {
                logger.error(`通知处理异常: ${notificationError instanceof Error ? notificationError.message : String(notificationError)}`);
              }
                
                // 完成整个过程，记录总耗时
                logger.timing(startTime, `整个图像生成任务完成，任务ID: ${taskId}`);
                
                // 返回成功响应
                return NextResponse.json({ 
                  taskId, 
                  status: 'success',
                  imageUrl: resultImageUrl,
                  prompt: currentFinalPrompt,
                  style: originalParams.style || null,
                  model: process.env.OPENAI_MODEL || 'gpt-4o-image-vip',
                  provider: 'tuzi'
                }, { status: 200 });
              } else {
                // 如果没有找到有效URL但还有重试机会
                if (currentAttempt < MAX_RETRY_ATTEMPTS) {
                  logger.warn(`未能提取到图片URL，将进行重试`);
                  currentAttempt++;
                  continue;
                }
                
                // 如果没有找到有效URL，记录详细日志并抛出错误
              logger.error(`无法提取有效的图片URL，响应内容: ${responseAnalysis.fullContent.substring(0, 200)}...`);
                throw new Error('API返回的响应中没有包含有效的图像生成结果');
              }
            } catch (attemptError) {
              lastError = attemptError;
              const errorMsg = attemptError instanceof Error ? attemptError.message : String(attemptError);
              
            // 记录详细错误信息到数据库
            try {
              await createAdminClient()
                .from('image_tasks')  // 修改为正确的表名
              .update({
                  error_message: errorMsg.substring(0, 500),
                  error_details: JSON.stringify({
                    attempt: currentAttempt,
                    timestamp: new Date().toISOString(),
                    error: errorMsg,
                    type: attemptError instanceof Error ? attemptError.name : 'Unknown'
                  }).substring(0, 1000),
                updated_at: new Date().toISOString()
              })
              .eq('task_id', taskId);
            } catch (dbError) {
              logger.error(`更新错误信息到数据库失败: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
            }
            
            if (shouldRetryError(attemptError) && currentAttempt < MAX_RETRY_ATTEMPTS) {
              currentAttempt++;
              continue;
            }
            
            throw attemptError;
          }
        }
        
        // 如果所有尝试都失败
        throw lastError || new Error('图像生成失败: 多次尝试后仍未能成功生成图像');
      } catch (finalError) {
        console.error(`图像生成全局错误:`, finalError);
        return NextResponse.json(
          { 
          status: 'failed',
            error: '系统错误',
            details: '图像生成服务临时不可用，请稍后重试'
          },
          { status: 500 }
        );
      } finally {
        // 清理超时检查器
        if (timeoutChecker) {
          clearInterval(timeoutChecker);
        }
        
        // 记录总处理时间
        const totalTime = Date.now() - requestStartTime;
        logger.info(`API请求总处理时间: ${totalTime}ms (${totalTime/1000}秒)`);
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
  } catch (finalError) {
    console.error(`图像生成全局错误:`, finalError);
    return NextResponse.json(
      { 
        status: 'failed',
        error: '系统错误',
        details: '图像生成服务临时不可用，请稍后重试'
      },
      { status: 500 }
    );
  } finally {
    // 清理超时检查器
    if (timeoutChecker) {
      clearInterval(timeoutChecker);
    }
    
    // 记录总处理时间
    const totalTime = Date.now() - requestStartTime;
    logger.info(`API请求总处理时间: ${totalTime}ms (${totalTime/1000}秒)`);
  }
} 