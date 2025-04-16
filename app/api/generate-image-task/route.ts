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

// 设置API超时时间 - 调整为适配Vercel Pro的超时时间
const API_TIMEOUT = 270000; // 270秒，给Vercel平台留出30秒处理开销

// 创建图资API客户端 - 按照tuzi-openai.md的方式
function createTuziClient() {
  // 获取环境配置
  const apiConfig = getApiConfig('tuzi') as TuziConfig;
  
  // 优先使用环境变量中的配置
  const apiKey = apiConfig.apiKey || process.env.OPENAI_API_KEY;
  const baseURL = apiConfig.apiUrl || process.env.OPENAI_BASE_URL || "https://api.tu-zi.com/v1/chat/completions";
  
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
  
  // 设置API最大重试次数 - 默认2次
  const maxRetries = 0; // 修改为0，表示不进行重试
  logger.debug(`API最大重试次数: ${maxRetries}次`);
  
  // 返回配置的客户端以及模型配置
  return {
    client: new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
      timeout: apiTimeout,
      maxRetries: maxRetries
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
    const modelUsed = process.env.OPENAI_MODEL || 'gpt-4o-all';
    
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
    
    logger.debug(`开始验证图片数据: 长度=${imageData.length}, 前缀=${imageData.substring(0, 30)}...`);
    
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
      
      logger.info(`图片数据验证通过: MIME类型=${mimeType}, base64长度=${base64Part.length}`);
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
function getAspectRatioDescription(aspectRatio: string | null): {
  simpleRatio: string, 
  orientationText: string,
  exactRatio: string // 添加精确比例
} {
  if (!aspectRatio) {
    return { simpleRatio: "1:1", orientationText: "正方形", exactRatio: "1:1" };
  }
  
  const [width, height] = aspectRatio.split(':').map(Number);
  const ratio = width / height;
  
  // 保存原始精确比例
  const exactRatio = `${width}:${height}`;
  
  // 计算最大公约数以简化比例
  const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b);
  };
  const divisor = gcd(width, height);
  const simpleWidth = width / divisor;
  const simpleHeight = height / divisor;
  
  // 检查是否接近标准比例
  let simpleRatio: string;
  if (Math.abs(ratio - 3/4) < 0.05) { // 接近3:4
    simpleRatio = "3:4";
  } else if (Math.abs(ratio - 4/3) < 0.05) { // 接近4:3
    simpleRatio = "4:3";
  } else if (Math.abs(ratio - 16/9) < 0.05) { // 接近16:9
    simpleRatio = "16:9";
  } else if (Math.abs(ratio - 9/16) < 0.05) { // 接近9:16
    simpleRatio = "9:16";
  } else if (Math.abs(ratio - 1) < 0.02) { // 接近1:1
    simpleRatio = "1:1";
  } else {
    // 使用计算出的简化比例
    simpleRatio = `${simpleWidth}:${simpleHeight}`;
  }
  
  // 添加更精确的比例描述
  let orientationText = "";
  if (ratio < 1) {
    orientationText = "竖向";
  } else if (ratio > 1) {
    orientationText = "横向";
  } else {
    orientationText = "正方形";
  }
  
  return { simpleRatio, orientationText, exactRatio };
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
  // 匹配常见的进度格式
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

        // 创建用户消息内容数组
        const userMessageContent: Array<ChatCompletionContentPart> = [];
        
        // 初始化提示词变量
        let promptText = prompt || "";
        let finalPrompt = "";
        
        // 获取比例描述
        const { simpleRatio, orientationText, exactRatio } = getAspectRatioDescription(aspectRatio);
        
        // 1. 确保使用正确的风格名称
        let styleName = "";
        if (style) {
          // 修正已知错误拼写
          styleName = style === "吉普力" ? "吉卜力" : style;
        }
        
        // 2. 从头构建提示词，不依赖原始输入，避免重复风格
        finalPrompt = "生成图像";
        
        // 3. 只添加一次风格名称
        if (styleName) {
          finalPrompt += `，${styleName}风格`;
        }
        
        // 4. 添加明确的比例指令，使用精确比例
        if (aspectRatio) {
          // 移除对正方形图像的强制要求，使用用户实际上传的比例
          if (orientationText === "正方形") {
            finalPrompt += `，${simpleRatio}比例，正方形图像`;
          } else {
            // 使用原始精确比例，确保生成正确比例的图像
            finalPrompt += `，精确${exactRatio}比例，${orientationText}图像`;
          }
        }
        
        // 5. 如果用户有其他非风格的提示内容，添加到末尾
        if (promptText && !promptText.includes("生成图像") && 
           (!styleName || !promptText.toLowerCase().includes(styleName.toLowerCase()))) {
          // 移除可能的风格名称避免重复 (包括错误拼写)
          let cleanPrompt = promptText;
          if (style === "吉普力") {
            cleanPrompt = cleanPrompt.replace(/吉普力风格/g, "").replace(/吉普力/g, "");
            cleanPrompt = cleanPrompt.replace(/吉卜力风格/g, "").replace(/吉卜力/g, "");
          } else if (style) {
            cleanPrompt = cleanPrompt.replace(new RegExp(`${style}风格`, 'g'), "");
            cleanPrompt = cleanPrompt.replace(new RegExp(`${style}`, 'g'), "");
          }
          
          // 清理多余逗号和空白
          cleanPrompt = cleanPrompt.trim().replace(/^，|，$/g, "").replace(/，+/g, "，");
          
          if (cleanPrompt) {
            finalPrompt += `，${cleanPrompt}`;
          }
        }
        
        if (image) {
          // 处理图片数据...
          let imageData;
          if (image.startsWith('data:image/')) {
            imageData = image;
          } else {
            // 为原始base64添加data URL前缀
            const mimeType = 'image/jpeg'; // 默认JPEG
            imageData = `data:${mimeType};base64,${image}`;
          }
          
          // 验证图片数据
          if (!imageData || imageData.length < 100) {
            throw new Error('图片数据无效');
          }
          
          // 添加图片到消息内容
          userMessageContent.push({
            type: "image_url",
            image_url: {
              url: imageData
            }
          });
          
          // 添加文本提示
          userMessageContent.push({
            type: "text",
            text: finalPrompt
          });
          
          logger.info(`图片处理：使用优化后的提示词模板，长度=${finalPrompt.length}字符`);
        } else {
          // 没有图片时，只添加文本内容
          userMessageContent.push({
            type: "text",
            text: finalPrompt
          });
        }
        
        // 构建单一用户消息 - 简化消息结构
        messages = [{
          role: 'user',
          content: userMessageContent
        }];
        
        logger.debug(`构建消息完成，消息数组长度: ${messages.length}`);
        logger.debug(`消息内容项目数: ${userMessageContent.length}`);
        
        // 记录最终提示词内容（完整记录，用于调试）
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
        
        // 确保用户消息包含图片数据 (如果有上传图片)
        if (image) {
          const userMessage = messages.find(msg => msg.role === 'user');
          if (!userMessage) {
            logger.error('无法找到用户消息');
            throw new Error('消息结构错误，缺少用户消息');
          }
          
          if (!Array.isArray(userMessage.content)) {
            logger.error('用户消息内容不是数组格式');
            throw new Error('用户消息格式错误，应为数组格式');
          }
          
          const hasImage = userMessage.content.some(item => item.type === 'image_url');
          if (!hasImage) {
            logger.error('用户消息中缺少图片数据');
            throw new Error('图片数据丢失，请重新上传图片');
          }
          
          logger.info('消息结构验证通过，包含用户图片数据');
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
        const MAX_RETRY_ATTEMPTS = 1; // 最多尝试一次重试 (共2次尝试)
        let currentAttempt = 0;
        let lastError = null;
        
        // 保存原始参数，确保重试时能够使用
        const originalParams = {
          aspectRatio: aspectRatio,
          standardAspectRatio: standardAspectRatio,
          size: size,
          finalPrompt: finalPrompt,
          style: style
        };
        
        // 使用变量存储当前使用的参数，以便在重试时更新
        let currentAspectRatio = aspectRatio;
        let currentStandardAspectRatio = standardAspectRatio;
        let currentSize = size;
        let currentFinalPrompt = finalPrompt;
        
        // 使用主方法 - GPT-4o聊天API生成图像
        logger.info('尝试使用GPT-4o聊天API生成图像');
        
        try {
          // 重试逻辑
          while (currentAttempt <= MAX_RETRY_ATTEMPTS) {
            try {
              // 如果不是首次尝试，记录重试信息
              if (currentAttempt > 0) {
                logger.info(`进行第${currentAttempt}次重试，任务ID: ${taskId}`);
                
                // 更新数据库中的尝试次数
                await supabaseAdmin
                  .from('image_tasks')
                  .update({
                    attempt_count: currentAttempt,
                    updated_at: new Date().toISOString()
                  })
                  .eq('task_id', taskId);
                
                // 重试时使用保存的原始参数
                logger.info(`重试保持原始提示词: ${originalParams.finalPrompt.substring(0, 100)}...`);
                logger.info(`重试保持原始比例参数: aspectRatio=${originalParams.aspectRatio || '未指定'}, standardAspectRatio=${originalParams.standardAspectRatio || '未指定'}, size=${originalParams.size}`);
                
                // 确保使用原始参数更新当前参数
                currentAspectRatio = originalParams.aspectRatio;
                currentStandardAspectRatio = originalParams.standardAspectRatio;
                currentSize = originalParams.size;
                currentFinalPrompt = originalParams.finalPrompt;
              }
              
              // 设置超时处理
              const API_TIMEOUT = parseInt(process.env.OPENAI_TIMEOUT || '180000');
              const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                  reject(new Error(`API请求超时，超过${API_TIMEOUT/1000}秒未响应`));
                }, API_TIMEOUT);
              });
              
              logger.info(`设置API请求超时: ${API_TIMEOUT/1000}秒`);
              
              // 简化API调用 - 完全采用py.md中的简洁模式
              const apiPromise = tuziClient.client.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o-image-vip',
                messages: [
                  // 移除系统提示，简化调用结构
                  {
                    role: 'user',
                    content: userMessageContent
                  }
                ],
                stream: true,
                max_tokens: 4096,
                temperature: image ? 0.3 : 0.5,
                top_p: image ? 0.8 : 0.9,
                response_format: { type: "json_object" }
                // 移除所有一级参数和自定义头部信息
              });
              
              // 记录使用更简化的API调用方式
              logger.info(`使用简化的API调用方式，遵循官方文档推荐结构`);
              
              // 增强API参数日志记录
              logger.info(`详细API调用参数：
- 模型: ${process.env.OPENAI_MODEL || 'gpt-4o-image-vip'}
- 仅包含用户消息，无系统提示
- 提示词中自然表达比例需求
- 图片上传: ${image ? '是' : '否'}
- 响应格式: JSON
              `);
              
              // 竞争：API调用 vs 超时
              const stream = await Promise.race([
                apiPromise,
                timeoutPromise
              ]) as any;
              
              logger.info(`请求成功发送，等待响应流...`);
              logger.timing(apiRequestStartTime, `API请求发送完成`);
              
              // 收集响应内容
              let responseContent = '';
              let imageUrl = null;
              let jsonPhaseComplete = false; // 标志是否完成了JSON分析阶段
              
              // 增强型响应分析记录
              let responseAnalysis = {
                totalChunks: 0,
                containsJsonStructure: false,
                mentionsRatio: false,
                mentionsDimensions: false,
                extractedJson: null as any,
                firstChunk: '',
                lastChunk: ''
              };
                  
              // 处理流式响应 - 带增强分析
              for await (const chunk of stream) {
                responseAnalysis.totalChunks++;
                const content = chunk.choices[0]?.delta?.content || '';
                
                // 保存第一个非空内容块
                if (content && !responseAnalysis.firstChunk) {
                  responseAnalysis.firstChunk = content;
                }
                
                // 持续更新最后一个内容块
                if (content) {
                  responseAnalysis.lastChunk = content;
                }
                
                // 检查JSON结构标记
                if (content.includes('{') && content.includes('}')) {
                  responseAnalysis.containsJsonStructure = true;
                  
                  // 尝试提取和记录完整JSON
                  try {
                    const jsonMatch = content.match(/({[\s\S]*})/);
                    if (jsonMatch && jsonMatch[1]) {
                      try {
                        responseAnalysis.extractedJson = JSON.parse(jsonMatch[1]);
                        logger.info(`从响应中提取到JSON: ${JSON.stringify(responseAnalysis.extractedJson)}`);
                      } catch (e) {
                        // JSON可能不完整，忽略解析错误
                      }
                    }
                  } catch (e) {
                    // 忽略JSON提取错误
                  }
                }
                
                // 检查与比例相关的内容
                if (content.includes('ratio') || content.includes('比例') || 
                    content.includes('aspect') || content.includes('3:4') || 
                    content.includes('4:3') || content.includes('1:1')) {
                  responseAnalysis.mentionsRatio = true;
                  logger.info(`响应流中提到比例相关内容: "${content}"`);
                }
                
                // 检查与尺寸相关的内容
                if (content.includes('size') || content.includes('dimension') || 
                    content.includes('尺寸') || content.includes('1024x1792') || 
                    content.includes('1792x1024') || content.includes('1024x1024')) {
                  responseAnalysis.mentionsDimensions = true;
                  logger.info(`响应流中提到尺寸相关内容: "${content}"`);
                }
                
                if (content) {
                  responseContent += content;
                  // 输出流式内容到控制台
                  process.stdout.write(content);
                  
                  // 添加进度解析和更新
                  const progressInfo = parseProgressFromContent(content);
                  if (progressInfo) {
                    logger.info(`检测到进度更新: ${progressInfo.progress}%, 阶段: ${progressInfo.stage}`);
                    
                    // 异步更新任务进度
                    reportProgress(taskId, progressInfo.progress, progressInfo.stage);
                  }
                  
                  // 检查是否已经完成JSON分析阶段
                  if (!jsonPhaseComplete && (
                    content.includes('生成图片') || 
                    content.includes('开始生成') || 
                    content.includes('正在生成图像') ||
                    responseContent.length > 500
                  )) {
                    jsonPhaseComplete = true;
                    logger.info('JSON分析阶段已完成，正在等待图像URL');
                    
                    // 更新任务状态为处理中
                    reportProgress(taskId, 20, TaskStages.PROCESSING);
                  }
                  
                  // 尝试从内容中提取图片URL
                  if (content.includes('http')) {
                    const extractedUrl = extractImageUrl(content);
                    if (extractedUrl) {
                      imageUrl = extractedUrl;
                      logger.info(`从流中提取到图片URL: ${imageUrl}`);
                      
                      // 更新任务状态为接近完成
                      reportProgress(taskId, 90, TaskStages.EXTRACTING_IMAGE);
                    }
                  }
                }
              }
              
              // 记录完整响应分析结果
              logger.info(`响应分析结果:
- 总内容块数: ${responseAnalysis.totalChunks}
- 包含JSON结构: ${responseAnalysis.containsJsonStructure ? '是' : '否'}
- 提及比例相关内容: ${responseAnalysis.mentionsRatio ? '是' : '否'}
- 提及尺寸相关内容: ${responseAnalysis.mentionsDimensions ? '是' : '否'}
- 首个内容块: "${responseAnalysis.firstChunk}"
- 最后内容块: "${responseAnalysis.lastChunk}"
- 响应总长度: ${responseContent.length}字符
- 是否提取到图片URL: ${imageUrl ? '是' : '否'}
              `);
              
              // 如果没有从流中提取到图片URL，从整个响应内容中尝试提取
              if (!imageUrl && responseContent) {
                logger.debug('尝试从完整的响应内容中提取URL');
                
                // 尝试解析JSON
                try {
                  // 尝试从文本中找到JSON格式的内容
                  const jsonMatch = responseContent.match(/({[\s\S]*})/);
                  if (jsonMatch && jsonMatch[1]) {
                    try {
                      const jsonData = JSON.parse(jsonMatch[1]);
                      logger.debug(`尝试从JSON中提取URL: ${JSON.stringify(jsonData).substring(0, 100)}...`);
                      logger.info(`完整JSON响应: ${JSON.stringify(jsonData)}`);
                      
                      // 在JSON中查找URL字段
                      if (jsonData.url) {
                        imageUrl = jsonData.url;
                        logger.info(`从JSON的url字段中提取到图片URL: ${imageUrl}`);
                      } else if (jsonData.image_url) {
                        imageUrl = jsonData.image_url;
                        logger.info(`从JSON的image_url字段中提取到图片URL: ${imageUrl}`);
                      } else if (jsonData.result_url) {
                        imageUrl = jsonData.result_url;
                        logger.info(`从JSON的result_url字段中提取到图片URL: ${imageUrl}`);
                      }
                      
                      // 记录与比例相关的字段（用于调试）
                      if (jsonData.ratio || jsonData.aspect_ratio || jsonData.dimensions) {
                        logger.info(`JSON中包含比例相关字段: 
- ratio: ${jsonData.ratio || '无'}
- aspect_ratio: ${jsonData.aspect_ratio || '无'}
- dimensions: ${jsonData.dimensions || '无'}
                        `);
                      }
                    } catch (jsonError) {
                      logger.warn(`JSON解析失败: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
                    }
                  }
                } catch (jsonParseError) {
                  logger.warn(`尝试解析JSON失败: ${jsonParseError instanceof Error ? jsonParseError.message : String(jsonParseError)}`);
                }
                
                // 如果从JSON解析中没有找到URL，继续使用正则提取
                if (!imageUrl) {
                  imageUrl = extractImageUrl(responseContent);
                  if (imageUrl) {
                    logger.info(`从完整响应中提取到图片URL: ${imageUrl}`);
                  }
                }
              }
              
              // 如果找到有效的图像URL，更新任务状态并返回
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
                
                // 记录生成历史
                await saveGenerationHistory(supabaseAdmin, currentUser.id, imageUrl, currentFinalPrompt, originalParams.style, currentAspectRatio, currentStandardAspectRatio)
                  .catch(historyError => 
                    logger.error(`记录生成历史失败: ${historyError instanceof Error ? historyError.message : String(historyError)}`)
                  );
                
                // 记录图像结果与原始参数的对比
                logger.info(`图像生成结果分析:
- 生成的图片URL: ${imageUrl.substring(0, 50)}...
- 比例参数: aspectRatio=${currentAspectRatio || '未指定'}, standardAspectRatio=${currentStandardAspectRatio || '未指定'}
- 目标尺寸: ${currentSize}
- 使用风格: ${originalParams.style || '未指定'}
- API响应耗时: ${Date.now() - apiRequestStartTime}ms
- 总处理耗时: ${Date.now() - startTime}ms
                `);
                
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
                  prompt: currentFinalPrompt,
                  style: originalParams.style || null,
                  model: process.env.OPENAI_MODEL || 'gpt-4o-image-vip',
                  provider: 'tuzi'
                }, { status: 200 });
              } else {
                // 如果JSON分析阶段尚未完成，并且这是首次尝试，不要立即判定为失败
                if (!jsonPhaseComplete && currentAttempt === 0) {
                  logger.warn(`API响应未包含图片URL，但JSON分析阶段尚未完成，将进行重试`);
                  currentAttempt++;
                  continue;
                }
                
                // 如果没有找到有效URL但还有重试机会
                if (currentAttempt < MAX_RETRY_ATTEMPTS) {
                  logger.warn(`未能提取到图片URL，将进行重试`);
                  currentAttempt++;
                  continue;
                }
                
                // 如果没有找到有效URL，记录详细日志并抛出错误
                logger.error(`无法提取有效的图片URL，响应内容: ${responseContent?.substring(0, 200)}...`);
                throw new Error('API返回的响应中没有包含有效的图像生成结果');
              }
            } catch (attemptError) {
              lastError = attemptError;
              const errorMsg = attemptError instanceof Error ? attemptError.message : String(attemptError);
              
              // 判断是否需要重试的错误类型
              const shouldRetry = 
                errorMsg.includes('timeout') || 
                errorMsg.includes('超时') ||
                errorMsg.includes('rate limit') ||
                errorMsg.includes('too many requests') ||
                errorMsg.includes('服务暂时不可用') ||
                errorMsg.includes('从完整的响应内容中提取URL');
                
              if (shouldRetry && currentAttempt < MAX_RETRY_ATTEMPTS) {
                logger.warn(`尝试${currentAttempt+1}/${MAX_RETRY_ATTEMPTS+1}失败: ${errorMsg}, 将进行重试...`);
                currentAttempt++;
                // 重试前短暂延迟
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue; // 继续重试
              }
              
              // 已达最大重试次数或不需要重试的错误
              logger.error(`图片生成失败，任务ID: ${taskId}, 错误: ${errorMsg}`);
              throw attemptError; // 将错误抛出到外部处理
            }
          }
          
          // 这里理论上不应该执行到，但为了代码完整性
          throw new Error(`图像生成失败：超出重试次数`);
        } catch (finalError) {
          // 所有重试都失败，直接更新任务状态为失败
          const errorMsg = finalError instanceof Error ? finalError.message : String(finalError);
          logger.error(`图像生成失败: ${errorMsg}`);
        
          // 更新任务状态为失败
          try {
            const { error: updateError } = await supabaseAdmin
              .from('image_tasks')
              .update({
                status: 'failed',
                error_message: errorMsg.substring(0, 1000), // 限制错误消息长度
                updated_at: new Date().toISOString()
              })
              .eq('task_id', taskId);
              
            if (updateError) {
              logger.error(`更新任务状态为failed失败: ${updateError.message}`);
            } else {
              logger.stateChange(taskId, 'processing', 'failed');
              logger.info(`已更新任务状态为failed, 任务ID: ${taskId}`);
            }
          } catch (updateError) {
            logger.error(`更新失败状态异常: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
          }
          
          // 尝试发送任务状态更新通知
          await notifyTaskUpdate(taskId, 'failed', undefined, errorMsg)
            .catch(notifyError => 
              logger.error(`发送失败通知失败: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`)
            );
          
          throw new Error(`图像生成失败: ${errorMsg}`);
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