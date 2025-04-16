/**
 * 任务进度更新工具
 * 用于从图像生成服务向主应用发送任务进度更新
 */

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
  apiKey: string = process.env.TASK_PROCESS_SECRET_KEY || ''
): Promise<Response | null> {
  try {
    // 输出进度更新日志
    console.log(`[图片任务] 更新任务 ${taskId} 进度: ${progress}%, 阶段: ${stage}`);

    // 验证参数
    if (!taskId) {
      console.error('[图片任务] 错误: 任务ID为空');
      return null;
    }

    if (progress < 0 || progress > 100) {
      console.warn(`[图片任务] 警告: 进度值 ${progress} 超出范围，已调整到有效范围`);
      progress = Math.max(0, Math.min(100, progress));
    }
    
    // 构建完整URL
    const url = `${apiBaseUrl}/api/update-task-progress`;
    
    // 如果API密钥为空，尝试从其他可能的环境变量获取
    if (!apiKey) {
      console.warn(`[图片任务] 警告: TASK_PROCESS_SECRET_KEY 为空，尝试从备用源获取`);
      
      // 尝试从多个可能的环境变量中获取
      apiKey = process.env.INTERNAL_API_KEY || 
               process.env.API_SECRET_KEY || 
               process.env.OPENAI_API_KEY?.substring(0, 8) || // 使用OpenAI密钥前8位作为备用
               'development-key';
      
      // 如果是开发环境，可以使用特殊标识
      if (process.env.NODE_ENV === 'development') {
        console.log('[图片任务] 开发环境中使用临时密钥');
      } else {
        console.warn(`[图片任务] 生产环境中缺少任务处理密钥，请设置TASK_PROCESS_SECRET_KEY环境变量`);
      }
    }
    
    // 发送更新请求，使用重试机制
    const response = await sendWithRetry(url, {
      taskId,
      progress,
      stage
    }, apiKey);
    
    return response;
  } catch (error) {
    console.error(`[图片任务] 更新任务 ${taskId} 进度出错:`, error);
    
    // 使用降级策略：直接在日志中记录进度，不阻塞主流程
    console.log(`[图片任务降级] 任务 ${taskId} 进度更新: ${progress}%, 阶段: ${stage} (仅记录到日志)`);
    
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
  
  // 准备多种认证头格式
  const authHeaders: Record<string, string>[] = [
    { 'Authorization': `Bearer ${apiKey}` },
    { 'x-api-key': apiKey },
    { 'X-API-Key': apiKey }
  ];
  
  while (retries <= maxRetries) {
    try {
      // 使用当前重试次数对应的认证头
      const currentHeaderIndex = retries % authHeaders.length;
      
      // 调整日志级别，减少正常尝试时的日志量
      if (retries === 0) {
        console.log(`[图片任务] 尝试更新任务进度`);
      } else {
        console.log(`[图片任务] 重试更新任务进度 (尝试 ${retries + 1}/${maxRetries + 1}) - 使用备用认证头`);
      }
      
      // 使用AbortController设置请求超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
      
      // 构建请求头
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // 添加认证头
      const authHeader = authHeaders[currentHeaderIndex];
      Object.keys(authHeader).forEach(key => {
        headers[key] = authHeader[key];
      });
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
          signal: controller.signal
        });
        
        // 清除超时定时器
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log(`[图片任务] 任务 ${data.taskId} 进度更新成功: ${data.progress}%`);
          return response;
        } else {
          const errorData = await response.json().catch(() => ({}));
          
          // 检查是否缺少数据库列
          if (response.status === 422 && errorData.code === 'schema_error') {
            console.warn(`[图片任务] 数据库结构不匹配: ${errorData.details || '缺少进度或阶段列'}`);
            console.warn(`[图片任务] 建议: ${errorData.suggestion || '运行数据库迁移脚本'}`);
            
            // 这种情况下不继续重试，但不视为致命错误
            return null;
          }
          
          console.error(`[图片任务] 更新任务 ${data.taskId} 进度失败: HTTP ${response.status}, 错误:`, errorData);
          lastError = { status: response.status, data: errorData };
          
          // 如果不是认证错误，不再重试
          if (response.status !== 401) {
            break;
          }
        }
      } finally {
        // 确保超时定时器被清除
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // 检查是否是超时或网络错误
      if (errorMsg.includes('abort') || errorMsg.includes('timeout')) {
        console.warn(`[图片任务] 更新进度请求超时 (尝试 ${retries + 1}/${maxRetries + 1})`);
      } else {
        console.error(`[图片任务] 更新进度请求异常 (尝试 ${retries + 1}/${maxRetries + 1}):`, error);
      }
      
      lastError = error;
    }
    
    retries++;
    
    // 最后一次尝试失败，但不影响图片生成流程
    if (retries > maxRetries) {
      console.warn(`[图片任务] 所有进度更新尝试失败，使用降级策略: 仅记录到日志`);
      
      // 这里实现降级策略，确保即使无法更新进度也不影响主流程
      // 可以考虑将进度信息写入本地缓存、发送到其他服务或执行其他降级操作
      return null;
    }
    
    // 重试前等待一会，使用指数退避
    const delay = Math.min(1000 * Math.pow(1.5, retries), 5000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // 所有尝试都失败
  console.error(`[图片任务] 任务 ${data.taskId} 进度更新失败，已尝试 ${retries} 次:`, lastError);
  return null;
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