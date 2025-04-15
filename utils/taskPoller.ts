/**
 * 任务轮询工具
 * 用于管理图像生成任务的状态轮询，支持指数退避策略和错误处理
 */

import { updatePendingTaskStatus } from './taskStorage';
import { TASK_CONFIG } from '@/constants/taskConfig';

// 轮询配置选项接口
export interface PollOptions {
  maxAttempts?: number;
  initialInterval?: number;
  maxInterval?: number;
  exponentialFactor?: number;
  failureRetries?: number;
  onProgress?: (progress: number, stage: string) => void;
  onStateChange?: (state: string) => void;
}

// 轮询状态
export type PollingState = 
  | 'idle'
  | 'polling'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

// 轮询结果
export interface PollingResult {
  status: PollingState;
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
    onStateChange
  } = options;

  let attempts = 0;
  let currentInterval = initialInterval;
  let consecutiveFailures = 0;
  let cancelled = false;
  let networkErrorsCount = 0;    // 网络错误计数
  const startTime = Date.now();
  
  // 更新轮询状态
  const updateState = (state: PollingState) => {
    if (onStateChange) {
      onStateChange(state);
    }
  };
  
  // 初始化状态
  updateState('polling');
  
  // 取消轮询函数
  const cancel = () => {
    cancelled = true;
    updateState('cancelled');
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
          status: 'cancelled',
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
        const response = await fetch(`/api/image-task-status/${taskId}`);
        
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
          updateState('completed');
          resolve({
            status: 'completed',
            data: result,
            attempts,
            elapsedTime: Date.now() - startTime
          });
          return;
        }

        // 检查任务是否失败
        if (result.status === TASK_CONFIG.TASK_STATUS.FAILED) {
          console.log(`[轮询] 任务${taskId}失败: ${result.error || '未知错误'}`);
          updateState('failed');
          
          // 更新任务本地存储状态
          updatePendingTaskStatus(
            taskId, 
            'failed', 
            result.error || '图片生成失败'
          );
          
          reject({
            status: 'failed',
            error: result.error || '图片生成失败',
            attempts,
            elapsedTime: Date.now() - startTime
          });
          return;
        }

        // 检查是否达到最大尝试次数
        if (attempts >= maxAttempts) {
          console.log(`[轮询] 任务${taskId}超过最大尝试次数`);
          updateState('timeout');
          
          // 更新任务本地存储状态
          updatePendingTaskStatus(
            taskId, 
            'timeout', 
            '轮询超时，请刷新页面查看结果'
          );
          
          // 超过最大尝试次数，但不立即失败，先检查一下任务是否还在进行
          try {
            const finalCheckResponse = await fetch(`/api/task-final-check/${taskId}`);
            const finalStatus = await finalCheckResponse.json();
            
            if (finalStatus.status === 'completed') {
              updateState('completed');
              resolve({
                status: 'completed',
                data: finalStatus,
                attempts,
                elapsedTime: Date.now() - startTime
              });
            } else {
              reject({
                status: 'timeout',
                error: '任务超时，但后台处理可能仍在继续',
                attempts,
                elapsedTime: Date.now() - startTime
              });
            }
          } catch (finalCheckError) {
            reject({
              status: 'timeout',
              error: '轮询超时，无法获取最终状态',
              attempts,
              elapsedTime: Date.now() - startTime
            });
          }
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