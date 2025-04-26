/**
 * 任务进度更新工具
 * 用于从图像生成服务向主应用发送任务进度更新
 */
import { createLogger, createSafeSummary } from './logger';

// 创建任务进度专用日志记录器
const logger = createLogger('图片任务');

// 添加节流控制
const progressUpdateCache = new Map<string, {
  lastUpdateTime: number;  // 上次更新时间
  lastProgress: number;    // 上次更新的进度
  lastStage: string;       // 上次更新的阶段
  pendingUpdate: boolean;  // 是否有待处理的更新
}>();

// 最小更新间隔（毫秒）
const MIN_UPDATE_INTERVAL = 3000; // 3秒

/**
 * 检查任务参数是否符合要求，返回修复后的参数
 * @param data 任务参数
 * @returns 修复后的任务参数
 */
function validateAndFixTaskParameters(data: any): any {
  // 如果没有数据，直接返回
  if (!data) return data;

  // 复制数据以避免直接修改原始对象
  const fixedData = { ...data };

  // 检查并处理尺寸参数
  if (fixedData.size === '1024x1024' && fixedData.ratio) {
    // 从比例计算合适的尺寸
    let ratio: number;
    try {
      // 比例可能是字符串格式，例如 "4:3" 或 "3:4"
      if (typeof fixedData.ratio === 'string' && fixedData.ratio.includes(':')) {
        const [width, height] = fixedData.ratio.split(':').map(Number);
        ratio = width / height;
      } else {
        ratio = Number(fixedData.ratio);
      }

      // 处理无效比例
      if (isNaN(ratio) || ratio <= 0) {
        logger.warn(`警告: 无效的比例值 ${fixedData.ratio}，使用默认比例 1:1`);
        ratio = 1;
      }

      // 基于比例计算新尺寸
      let newSize: string;
      if (ratio < 0.9) { // 竖屏图像
        newSize = '1024x1792';
      } else if (ratio > 1.1) { // 横屏图像
        newSize = '1792x1024';
      } else { // 接近正方形
        newSize = '1024x1024';
      }

      // 如果计算出的尺寸与当前不同，则更新并记录
      if (newSize !== fixedData.size) {
        logger.info(`根据宽高比(${ratio.toFixed(2)})调整尺寸: ${fixedData.size} -> ${newSize}`);
        fixedData.size = newSize;
      }
    } catch (e) {
      logger.error(`计算图像尺寸时出错:`, e);
    }
  }

  // 检查参考图像设置
  if (fixedData.referenceImage === true && (!fixedData.imageData && !fixedData.imageHash)) {
    logger.warn(`警告: 启用了参考图像但未提供图像数据或哈希值`);
  }

  // 处理图像数据 - 避免日志中记录完整base64
  if (fixedData.imageData && typeof fixedData.imageData === 'string') {
    // 在日志中记录安全摘要
    logger.debug(`图像数据: ${createSafeSummary(fixedData.imageData)}`);
  }

  return fixedData;
}

/**
 * 更新任务进度
 * @param taskId 任务ID
 * @param progress 进度百分比（0-100）
 * @param stage 当前处理阶段
 * @param apiBaseUrl API基础URL，默认使用生产环境URL
 * @param apiKey 用于授权的API密钥
 * @returns 成功时返回response，失败时返回null
 */
export async function updateTaskProgress(
  taskId: string,
  progress: number,
  stage: string,
  apiBaseUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'https://www.imgtutu.ai',
  apiKey: string = process.env.TASK_PROCESS_SECRET_KEY || '',
  additionalData: any = {}
): Promise<Response | null> {
  try {
    // 使用progress方法替代直接的console.log，避免过多的进度日志
    logger.progress(taskId, progress, stage);

    // 验证参数
    if (!taskId) {
      logger.error(`错误: 任务ID为空`);
      return null;
    }

    if (progress < 0 || progress > 100) {
      logger.warn(`警告: 进度值 ${progress} 超出范围，已调整到有效范围`);
      progress = Math.max(0, Math.min(100, progress));
    }
    
    // 获取当前时间
    const currentTime = Date.now();
    
    // 检查节流控制 - 如果上次更新时间太近，则跳过本次更新
    // 除非是进度为100%（完成）或0%（开始）或阶段发生变化
    const taskCacheKey = `${taskId}`;
    const taskCache = progressUpdateCache.get(taskCacheKey);
    
    // 特殊处理完成状态
    if (progress >= 95) {
      // 确保最后的进度更新一定会发送
      logger.debug(`任务 ${taskId} 接近完成，强制更新进度`);
      
      // 如果进度>=95%且stage不是completed，则强制设置为completed
      if (stage !== 'completed' && progress >= 99.9) {
        stage = 'completed';
        progress = 100;
        logger.info(`任务 ${taskId} 已完成，设置最终状态`);
        
        // 强制绕过节流控制，确保完成状态立即更新
        if (taskCache) {
          taskCache.lastUpdateTime = 0;
          taskCache.pendingUpdate = false;
        }
      }
    }
    
    if (taskCache) {
      const timeSinceLastUpdate = currentTime - taskCache.lastUpdateTime;
      const isSameStage = taskCache.lastStage === stage;
      const isSmallProgressChange = Math.abs(progress - taskCache.lastProgress) < 10;
      
      // 特殊情况：始终更新的条件
      const isSpecialProgress = progress === 0 || progress === 100 || stage === 'completed';
      const isStageChange = !isSameStage;
      
      // 如果时间间隔太短，且不是特殊情况，跳过更新
      if (timeSinceLastUpdate < MIN_UPDATE_INTERVAL && 
          !isSpecialProgress && !isStageChange && isSmallProgressChange) {
        logger.debug(`跳过更新：间隔过短(${timeSinceLastUpdate}ms < ${MIN_UPDATE_INTERVAL}ms)，非关键进度`);
        
        // 记录有待处理的更新
        taskCache.pendingUpdate = true;
        progressUpdateCache.set(taskCacheKey, taskCache);
        
        return null;
      }
    }
    
    // 构建完整URL
    const url = `${apiBaseUrl}/api/update-task-progress`;
    
    // 如果API密钥为空，尝试从其他可能的环境变量获取
    if (!apiKey) {
      logger.warn(`警告: TASK_PROCESS_SECRET_KEY 为空，尝试从备用源获取`);
      
      // 尝试从多个可能的环境变量中获取
      apiKey = process.env.INTERNAL_API_KEY || 
               process.env.API_SECRET_KEY || 
               process.env.OPENAI_API_KEY?.substring(0, 8) || // 使用OpenAI密钥前8位作为备用
               'development-key';
      
      // 如果是开发环境，可以使用特殊标识
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`开发环境中使用临时密钥`);
      } else {
        logger.warn(`生产环境中缺少任务处理密钥，请设置TASK_PROCESS_SECRET_KEY环境变量`);
      }
    }
    
    // 构建请求数据
    let requestData = {
      taskId,
      progress,
      stage,
      ...additionalData
    };
    
    // 验证并修复任务参数
    requestData = validateAndFixTaskParameters(requestData);
    
    // 发送更新请求，使用重试机制
    const response = await sendWithRetry(url, requestData, apiKey);
    
    // 更新任务缓存
    progressUpdateCache.set(taskCacheKey, {
      lastUpdateTime: currentTime,
      lastProgress: progress,
      lastStage: stage,
      pendingUpdate: false
    });
    
    // 记录最新的进度到本地存储，作为降级机制
    try {
      if (typeof localStorage !== 'undefined') {
        const progressKey = `task_progress_${taskId}`;
        localStorage.setItem(progressKey, JSON.stringify({
          progress,
          stage,
          timestamp: currentTime
        }));
      }
    } catch (storageError) {
      logger.warn(`无法保存进度到本地存储:`, storageError);
    }
    
    return response;
  } catch (error) {
    logger.error(`更新任务 ${taskId} 进度出错:`, error);
    
    // 使用降级策略：直接在日志中记录进度，不阻塞主流程
    logger.debug(`[降级] 任务 ${taskId} 进度更新: ${progress}%, 阶段: ${stage} (仅记录到日志)`);
    
    // 错误不会传播到调用方，确保不影响图片生成流程
    return null;
  }
}

/**
 * 发送请求并自动重试
 * @param url 请求URL
 * @param data 请求数据
 * @param apiKey API密钥
 * @param maxRetries 最大重试次数
 * @returns 成功时返回response，失败时返回null
 */
async function sendWithRetry(
  url: string,
  data: any,
  apiKey: string,
  maxRetries: number = 2
): Promise<Response | null> {
  let retries = 0;
  let lastError: any = null;
  
  // 根据错误类型获取退避时间
  const getBackoffTime = (attempt: number, errorType: string = 'default'): number => {
    // 基础退避时间 - 指数增长
    const baseBackoff = Math.min(1000 * Math.pow(2, attempt), 10000);
    
    // 根据错误类型调整退避时间
    switch (errorType) {
      case 'network':
        // 网络错误使用较短的初始退避时间，但重试更多次
        return Math.min(800 * Math.pow(1.5, attempt), 5000);
      case 'server':
        // 服务器错误使用较长的退避时间
        return Math.min(1500 * Math.pow(2, attempt), 15000);
      case 'timeout':
        // 超时错误使用更长的退避时间
        return Math.min(2000 * Math.pow(2, attempt), 20000);
      case 'conflict':
        // 数据冲突使用随机化的退避时间，避免多个客户端同时重试
        return Math.min(1000 * Math.pow(1.8, attempt) * (0.8 + Math.random() * 0.4), 12000);
      default:
        return baseBackoff;
    }
  };
  
  // 根据错误判断错误类型
  const getErrorType = (error: any): string => {
    if (!error) return 'default';
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // 网络相关错误
    if (
      error.name === 'AbortError' || 
      errorMessage.includes('fetch failed') ||
      errorMessage.includes('network') ||
      errorMessage.includes('connection')
    ) {
      return 'network';
    }
    
    // 服务器错误
    if (
      (lastError?.status && lastError.status >= 500 && lastError.status < 600) ||
      errorMessage.includes('server error') ||
      errorMessage.includes('internal error')
    ) {
      return 'server';
    }
    
    // 超时错误
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out')
    ) {
      return 'timeout';
    }
    
    // 冲突错误
    if (
      (lastError?.status === 409) ||
      errorMessage.includes('conflict') ||
      errorMessage.includes('already exists') ||
      errorMessage.includes('PGRST116') ||
      errorMessage.includes('multiple (or no) rows')
    ) {
      return 'conflict';
    }
    
    return 'default';
  };
  
  // 根据错误类型获取最大重试次数
  const getMaxRetriesForErrorType = (errorType: string): number => {
    switch (errorType) {
      case 'network': return Math.max(maxRetries, 3); // 网络错误多重试几次
      case 'conflict': return Math.max(maxRetries, 4); // 冲突错误多重试几次
      case 'timeout': return 2; // 超时错误少重试几次
      default: return maxRetries;
    }
  };
  
  while (retries <= maxRetries) {
    try {
      // 创建带超时的 AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-Retry-Count': String(retries),
          'X-Client-Id': generateClientId() // 添加客户端ID，帮助服务器识别请求来源
        },
        body: JSON.stringify(data),
        signal: controller.signal,
        // 添加缓存控制，避免缓存问题
        cache: 'no-store'
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        logger.debug(`任务 ${data.taskId} 进度更新成功: ${data.progress}%`);
        return response;
      } else {
        const errorData = await response.json().catch(() => ({}));
        
        // 检查是否缺少数据库列
        if (response.status === 422 && errorData.code === 'schema_error') {
          logger.warn(`数据库结构不匹配: ${errorData.details || '缺少进度或阶段列'}`);
          logger.warn(`建议: ${errorData.suggestion || '运行数据库迁移脚本'}`);
          return null;
        }
        
        // 检查是否是列不存在错误
        if (response.status === 500 && 
           (errorData.details?.includes('column') && 
            errorData.details?.includes('does not exist'))) {
          logger.warn(`列不存在错误: ${errorData.details}`);
          return null;
        }
        
        // 如果是认证错误或服务器错误，进行重试
        if (response.status === 401 || (response.status >= 500 && response.status < 600) || response.status === 409) {
          lastError = { status: response.status, data: errorData };
          throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
        }
        
        // 其他错误直接返回null
        logger.error(`更新任务 ${data.taskId} 进度失败: HTTP ${response.status}, 错误:`, errorData);
        return null;
      }
    } catch (error: unknown) {
      const errorType = getErrorType(error);
      const dynMaxRetries = getMaxRetriesForErrorType(errorType);
      
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      const shouldRetry = isTimeout || 
                          (error instanceof Error && error.message.includes('fetch failed')) ||
                          (lastError?.status && [409, 429, 500, 502, 503, 504].includes(lastError.status));
      
      if (shouldRetry && retries < dynMaxRetries) {
        const backoffTime = getBackoffTime(retries, errorType);
        logger.warn(`更新失败(${errorType}错误)，将在 ${backoffTime}ms 后重试 (${retries + 1}/${dynMaxRetries}): ${error instanceof Error ? error.message : String(error)}`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        retries++;
        continue;
      }
      
      // 达到最大重试次数或不可重试的错误
      logger.error(`更新任务 ${data.taskId} 进度最终失败:`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }
  
  return null;
}

/**
 * 生成唯一的客户端ID，用于跟踪请求
 */
function generateClientId(): string {
  // 使用固定前缀+时间戳+随机数组合，确保唯一性
  const prefix = 'client';
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 处理阶段常量，确保前后端阶段名称统一
 */
export const TaskStages = {
  PREPARING: 'preparing',           // 准备阶段
  CONFIGURING: 'configuring',       // 配置阶段
  SENDING_REQUEST: 'sending_request', // 发送请求阶段
  QUEUING: 'queuing',               // 排队中
  GENERATING: 'generating',         // 生成中
  PROCESSING: 'processing',         // 处理中（通用）
  EXTRACTING_IMAGE: 'extracting_image', // 提取图像
  FINALIZING: 'finalizing',         // 最终处理
  COMPLETED: 'completed',           // 已完成
  FAILED: 'failed',                 // 失败
  CANCELLED: 'cancelled'            // 已取消
};

/**
 * 进度更新辅助函数，用于API中间处理过程中上报进度
 */
export function reportProgress(
  taskId: string,
  progress: number,
  stage: string,
  apiBaseUrl?: string,
  apiKey?: string
): void {
  // 异步发送进度更新，不等待结果
  updateTaskProgress(taskId, progress, stage, apiBaseUrl, apiKey)
    .catch(error => {
      // 捕获并处理任何异常，确保不影响主流程
      console.error(`[图片任务] 异步报告任务 ${taskId} 进度失败:`, error);
      
      // 降级：仅记录到控制台
      console.log(`[图片任务降级] 任务 ${taskId} 进度: ${progress}%, 阶段: ${stage} (记录到控制台)`);
    });
}