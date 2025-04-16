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
    
    // 发送更新请求
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        taskId,
        progress,
        stage
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[图片任务] 更新任务 ${taskId} 进度失败: HTTP ${response.status}, 错误:`, errorData);
      return null;
    }
    
    console.log(`[图片任务] 任务 ${taskId} 进度更新成功: ${progress}%`);
    return response;
  } catch (error) {
    console.error(`[图片任务] 更新任务 ${taskId} 进度出错:`, error);
    return null;
  }
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