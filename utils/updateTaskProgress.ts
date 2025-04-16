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
    
    // 构建完整URL
    const url = `${apiBaseUrl}/api/update-task-progress`;
    
    // 如果API密钥为空，尝试从其他可能的环境变量获取
    if (!apiKey) {
      console.warn(`[图片任务] 警告: TASK_PROCESS_SECRET_KEY 为空，尝试从备用源获取`);
      apiKey = process.env.INTERNAL_API_KEY || process.env.API_SECRET_KEY || 'development-key';
    }
    
    // 发送更新请求，使用重试机制
    return await sendWithRetry(url, {
      taskId,
      progress,
      stage
    }, apiKey);
  } catch (error) {
    console.error(`[图片任务] 更新任务 ${taskId} 进度出错:`, error);
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
      
      console.log(`[图片任务] 尝试更新任务进度 (尝试 ${retries + 1}/${maxRetries + 1})${retries > 0 ? ' - 使用备用认证头' : ''}`);
      
      // 构建请求头
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // 添加认证头
      const authHeader = authHeaders[currentHeaderIndex];
      Object.keys(authHeader).forEach(key => {
        headers[key] = authHeader[key];
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        console.log(`[图片任务] 任务 ${data.taskId} 进度更新成功: ${data.progress}%`);
        return response;
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[图片任务] 更新任务 ${data.taskId} 进度失败: HTTP ${response.status}, 错误:`, errorData);
        lastError = { status: response.status, data: errorData };
        
        // 如果不是认证错误，不再重试
        if (response.status !== 401) {
          break;
        }
      }
    } catch (error) {
      console.error(`[图片任务] 更新进度请求异常 (尝试 ${retries + 1}/${maxRetries + 1}):`, error);
      lastError = error;
    }
    
    retries++;
    
    // 最后一次尝试，直接更新数据库
    if (retries > maxRetries) {
      console.warn(`[图片任务] 所有进度更新尝试失败，使用备用更新机制或跳过`);
      // 这里可以增加直接更新数据库的逻辑，但需要数据库访问权限
      break;
    }
    
    // 重试前等待一会
    await new Promise(resolve => setTimeout(resolve, 1000));
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
      console.error(`[图片任务] 异步报告任务 ${taskId} 进度失败:`, error);
    });
} 