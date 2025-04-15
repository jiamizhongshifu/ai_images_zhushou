/**
 * 任务轮询工具
 * 用于管理图像生成任务的状态轮询，支持指数退避策略和错误处理
 */

import { updateTaskStatus, getPendingTask, clearPendingTask } from './taskStorage';
import { TASK_CONFIG } from '@/constants/taskConfig';
import { TaskStatus } from '@/types/task';

// 轮询配置选项接口
export interface PollOptions {
  maxAttempts?: number;
  initialInterval?: number;
  maxInterval?: number;
  exponentialFactor?: number;
  failureRetries?: number;
  onProgress?: (progress: number, stage: string) => void;
  onStateChange?: (state: TaskStatus) => void;
  autoRetry?: boolean;  // 添加自动重试选项
  retryDelay?: number;  // 重试延迟时间(毫秒)
}

// 轮询状态
export type PollingState = TaskStatus;

// 轮询结果
export interface PollingResult {
  status: TaskStatus;
  data?: any;
  error?: string;
  attempts: number;
  elapsedTime: number;
}

/**
 * 增强型任务轮询函数
 * 使用指数退避策略和错误处理机制，轮询任务状态
 */
export async function enhancedPollTaskStatus(
  taskId: string,
  options: PollOptions = {}
): Promise<PollingResult> {
  const {
    maxAttempts = TASK_CONFIG.POLLING_MAX_ATTEMPTS,
    initialInterval = TASK_CONFIG.POLLING_INTERVAL,
    maxInterval = 10000,
    exponentialFactor = 1.5,
    failureRetries = 3,
    onProgress,
    onStateChange,
    autoRetry = false,
    retryDelay = 5000
  } = options;

  let attempts = 0;
  let currentInterval = initialInterval;
  let consecutiveFailures = 0;
  let cancelled = false;
  let networkErrorsCount = 0;    // 网络错误计数
  const startTime = Date.now();
  
  // 更新轮询状态
  const updateState = (state: TaskStatus) => {
    if (onStateChange) {
      onStateChange(state);
    }
  };
  
  // 初始化状态
  updateState(TaskStatus.PROCESSING);
  
  // 取消轮询函数
  const cancel = () => {
    cancelled = true;
    updateState(TaskStatus.CANCELLED);
    console.log(`[轮询] 任务${taskId}轮询已取消`);
  };
  
  // 检查网络连接状态
  const checkNetworkStatus = (): boolean => {
    return navigator.onLine;
  };
  
  // 等待网络恢复
  const waitForNetworkReconnection = async (): Promise<void> => {
    // 使用Promise等待网络连接恢复
    return new Promise((resolve) => {
      if (checkNetworkStatus()) {
        resolve();
        return;
      }
      
      console.log('[轮询] 等待网络连接恢复...');
      
      // 监听网络恢复事件
      const handleOnline = () => {
        console.log('[轮询] 网络连接已恢复');
        window.removeEventListener('online', handleOnline);
        resolve();
      };
      
      window.addEventListener('online', handleOnline);
    });
  };
  
  return new Promise((resolve, reject) => {
    // 检查任务状态函数
    const checkStatus = async () => {
      // 如果已取消，停止轮询
      if (cancelled) {
        reject({
          status: TaskStatus.CANCELLED,
          error: '轮询已取消',
          attempts,
          elapsedTime: Date.now() - startTime
        });
        return;
      }
      
      // 检查网络连接状态
      if (!checkNetworkStatus()) {
        console.log('[轮询] 检测到网络连接中断');
        await waitForNetworkReconnection();
        
        // 网络恢复后立即检查任务状态
        setTimeout(checkStatus, 1000);
        return;
      }
      
      try {
        attempts++;
        console.log(`[轮询] 第${attempts}次检查任务${taskId}状态`);
        
        // 尝试获取任务状态
        const response = await fetch(`/api/image-task-status/${taskId}`, {
          // 添加请求头，防止缓存
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // 重置网络错误计数
        networkErrorsCount = 0;
        
        // 解析响应数据
        const result = await response.json();
        
        // 重置连续失败计数
        consecutiveFailures = 0;
        
        // 回调进度更新
        if (onProgress && result.progress !== undefined) {
          onProgress(result.progress, result.stage || 'processing');
        }

        // 回调状态变化
        if (onStateChange && result.status) {
          onStateChange(result.status);
        }

        // 检查任务是否完成
        if (result.status === TASK_CONFIG.TASK_STATUS.COMPLETED) {
          console.log(`[轮询] 任务${taskId}已完成`);
          updateState(TaskStatus.COMPLETED);
          resolve({
            status: TaskStatus.COMPLETED,
            data: result,
            attempts,
            elapsedTime: Date.now() - startTime
          });
          return;
        }

        // 检查任务是否失败
        if (result.status === TASK_CONFIG.TASK_STATUS.FAILED) {
          console.log(`[轮询] 任务${taskId}失败: ${result.error || '未知错误'}`);
          updateState(TaskStatus.FAILED);
          
          // 更新任务本地存储状态
          updateTaskStatus(
            taskId, 
            TaskStatus.FAILED,
            result.error || '图片生成失败'
          );
          
          // 如果启用自动重试，则尝试重新创建任务
          if (autoRetry) {
            console.log(`[轮询] 启用自动重试，将在${retryDelay/1000}秒后重新创建任务`);
            setTimeout(() => {
              retryTask(taskId).catch(e => 
                console.error('[轮询] 自动重试失败:', e)
              );
            }, retryDelay);
          }
          
          reject({
            status: TaskStatus.FAILED,
            error: result.error || '图片生成失败',
            attempts,
            elapsedTime: Date.now() - startTime
          });
          return;
        }

        // 检查是否达到最大尝试次数
        if (attempts >= maxAttempts) {
          console.log(`[轮询] 任务${taskId}超过最大尝试次数`);
          updateState(TaskStatus.FAILED);
          
          // 更新任务本地存储状态
          updateTaskStatus(
            taskId, 
            TaskStatus.FAILED,
            '任务处理超时'
          );
          
          reject({
            status: TaskStatus.FAILED,
            error: '任务处理超时',
            attempts,
            elapsedTime: Date.now() - startTime
          });
          return;
        }
        
        // 增加轮询间隔，但不超过最大值
        currentInterval = Math.min(
          currentInterval * exponentialFactor,
          maxInterval
        );
        
        // 安排下一次检查
        setTimeout(checkStatus, currentInterval);
        
      } catch (error) {
        console.error(`[轮询错误] 尝试 ${attempts + 1}/${maxAttempts}:`, error);
        
        consecutiveFailures++;
        
        // 如果连续失败次数超过限制，抛出错误
        if (consecutiveFailures > failureRetries) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          reject(new Error(`轮询失败: ${errorMessage}`));
          return;
        }
        
        // 失败后增加轮询间隔
        currentInterval = Math.min(
          currentInterval * 2,
          maxInterval
        );
        
        networkErrorsCount++;
        
        // 如果网络错误超过阈值，记录为可恢复错误
        if (networkErrorsCount > 3) {
          console.error(`[轮询] 网络错误次数过多，标记任务${taskId}为可恢复`);
          updateTaskStatus(
            taskId, 
            TaskStatus.FAILED,
            '网络连接问题，可尝试恢复任务'
          );
        }
      }
    };
    
    // 开始第一次检查
    checkStatus();
  });
}

/**
 * 根据等待时间估算进度百分比
 * @param waitTime 等待时间（秒）
 * @returns 估计的进度百分比（0-100）
 */
function getEstimatedProgress(waitTime: number): number {
  // 预估总处理时间为180秒
  const estimatedTotalTime = 180;
  
  if (waitTime < 5) return 5;
  if (waitTime < 10) return 10;
  if (waitTime < 20) return 20;
  if (waitTime < 30) return 30;
  if (waitTime < 60) return 30 + Math.min(30, waitTime / 2);
  if (waitTime < 120) return Math.min(80, 60 + waitTime / 6);
  
  // 超过120秒后进度缓慢增加
  return Math.min(95, 80 + (waitTime - 120) / 12);
}

/**
 * 根据等待时间确定当前阶段
 * @param waitTime 等待时间（秒）
 * @returns 当前处理阶段
 */
function getStageFromWaitTime(waitTime: number): string {
  if (waitTime < 5) return 'preparing';
  if (waitTime < 10) return 'configuring';
  if (waitTime < 15) return 'sending_request';
  if (waitTime < 60) return 'processing';
  if (waitTime < 120) return 'processing';
  if (waitTime < 150) return 'extracting_image';
  return 'finalizing';
}

/**
 * 尝试恢复失败的任务
 * @param taskId 任务ID
 * @param forceSyncWithServer 是否强制与服务器同步状态
 * @returns 是否成功恢复任务
 */
export async function recoverTask(
  taskId: string, 
  forceSyncWithServer = true
): Promise<boolean> {
  console.log(`[任务恢复] 尝试恢复任务: ${taskId}`);
  
  // 从本地存储获取任务
  const task = getPendingTask(taskId);
  if (!task) {
    console.error('[任务恢复] 无法找到本地任务记录');
    return false;
  }
  
  try {
    // 如果需要与服务器同步，先检查服务器上的任务状态
    if (forceSyncWithServer) {
      const response = await fetch(`/api/image-task-status/${taskId}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.ok) {
        const serverTask = await response.json();
        
        // 如果服务器上的任务已完成，直接返回结果
        if (serverTask.status === TASK_CONFIG.TASK_STATUS.COMPLETED) {
          console.log(`[任务恢复] 服务器任务已完成: ${taskId}`);
          updateTaskStatus(
            taskId, 
            TaskStatus.COMPLETED
          );
          // 应用程序可以通过恢复结果使用该URL
          return true;
        }
        
        // 如果服务器上的任务仍在处理中，更新本地状态并继续轮询
        if (serverTask.status === TASK_CONFIG.TASK_STATUS.PROCESSING) {
          console.log(`[任务恢复] 服务器任务仍在处理中: ${taskId}`);
          updateTaskStatus(
            taskId, 
            TaskStatus.PROCESSING
          );
          // 应用程序可以继续轮询此任务
          return true;
        }
      } else {
        console.warn(`[任务恢复] 服务器状态检查失败: ${response.status}`);
        // 服务器检查失败，继续尝试本地恢复
      }
    }
    
    // 更新任务状态为处理中
    updateTaskStatus(
      taskId, 
      TaskStatus.PROCESSING
    );
    
    console.log(`[任务恢复] 任务已恢复: ${taskId}`);
    return true;
  } catch (error) {
    console.error('[任务恢复] 恢复任务时出错:', error);
    return false;
  }
}

/**
 * 重试失败的任务
 * @param taskId 原任务ID
 * @returns 新的任务ID或null
 */
export async function retryTask(taskId: string): Promise<string | null> {
  console.log(`[任务重试] 尝试重试任务: ${taskId}`);
  
  // 从本地存储获取任务
  const task = getPendingTask(taskId);
  if (!task) {
    console.error('[任务重试] 无法找到本地任务记录');
    return null;
  }
  
  try {
    // 使用原始参数创建新任务
    const response = await fetch('/api/generate-image-task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(task.params),
    });
    
    if (!response.ok) {
      throw new Error(`创建任务失败: ${response.status}`);
    }
    
    const data = await response.json();
    const newTaskId = data.taskId;
    
    console.log(`[任务重试] 已创建新任务: ${newTaskId}`);
    
    // 清除原始任务
    clearPendingTask(taskId);
    
    return newTaskId;
  } catch (error) {
    console.error('[任务重试] 重试任务时出错:', error);
    return null;
  }
} 