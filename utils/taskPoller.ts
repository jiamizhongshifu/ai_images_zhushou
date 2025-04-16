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

// 任务进度状态缓存，用于进度平滑过渡
interface ProgressCache {
  [taskId: string]: {
    lastProgress: number;
    lastStage: string;
    lastUpdate: number;
  }
}

// 全局进度缓存
const taskProgressCache: ProgressCache = {};

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
  
  // 初始化任务进度缓存
  if (!taskProgressCache[taskId]) {
    taskProgressCache[taskId] = {
      lastProgress: 0,
      lastStage: 'queued',
      lastUpdate: Date.now()
    };
  }
  
  // 更新轮询状态
  const updateState = (state: PollingState) => {
    if (onStateChange) {
      onStateChange(state);
    }
  };
  
  // 初始化状态
  updateState('polling');
  
  /**
   * 平滑过渡进度
   * @param currentProgress 当前进度
   * @param targetProgress 目标进度
   * @param stage 当前阶段
   */
  const smoothProgress = (currentProgress: number, targetProgress: number, stage: string) => {
    const cache = taskProgressCache[taskId];
    
    // 如果目标进度小于当前进度，可能是由于轮询返回的数据有误，保持当前进度
    if (targetProgress < cache.lastProgress && stage === cache.lastStage) {
      // 特殊情况：如果阶段没变但进度回退超过10%，可能是实际发生了回退
      if (cache.lastProgress - targetProgress <= 10) {
        return cache.lastProgress;
      }
    }
    
    // 如果进度变化超过20%，采用渐进过渡
    if (Math.abs(targetProgress - cache.lastProgress) > 20) {
      // 计算平滑过渡的中间进度值
      const timeDiff = Date.now() - cache.lastUpdate;
      const progressStep = Math.max(1, Math.min(5, Math.floor(timeDiff / 500))); // 每500ms最多增加5%
      
      if (targetProgress > cache.lastProgress) {
        // 向上平滑增长
        const newProgress = Math.min(targetProgress, cache.lastProgress + progressStep);
        cache.lastProgress = newProgress;
        cache.lastUpdate = Date.now();
        return newProgress;
      } else {
        // 阶段变化时允许进度回退
        cache.lastProgress = targetProgress;
        cache.lastStage = stage;
        cache.lastUpdate = Date.now();
        return targetProgress;
      }
    }
    
    // 正常进度更新
    cache.lastProgress = targetProgress;
    cache.lastStage = stage;
    cache.lastUpdate = Date.now();
    return targetProgress;
  };
  
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
  
  // 检查网络连接状态并等待恢复
  const waitForNetwork = async (maxWaitTime = 30000): Promise<boolean> => {
    if (checkNetworkStatus()) {
      return true; // 网络已连接
    }

    console.log('[轮询] 等待网络连接恢复...');
    
    return new Promise((resolve) => {
      // 网络恢复时的处理函数
      const handleOnline = () => {
        window.removeEventListener('online', handleOnline);
        clearTimeout(timeoutId);
        console.log('[轮询] 网络连接已恢复');
        resolve(true);
      };
      
      // 超时处理
      const timeoutId = setTimeout(() => {
        window.removeEventListener('online', handleOnline);
        console.log('[轮询] 等待网络恢复超时');
        resolve(false);
      }, maxWaitTime);
      
      // 监听网络恢复事件
      window.addEventListener('online', handleOnline);
    });
  };
  
  // 获取任务最终状态 - 绕过常规API，直接查询数据库中的状态
  const getFinalTaskStatus = async (taskId: string): Promise<any> => {
    try {
      // 先尝试通过最终状态检查API获取
      console.log('[轮询] 尝试通过任务最终状态检查API获取状态');
      const finalCheckResponse = await fetch(`/api/task-final-check/${taskId}`);
      
      if (!finalCheckResponse.ok) {
        throw new Error(`HTTP error! status: ${finalCheckResponse.status}`);
      }
      
      const finalStatus = await finalCheckResponse.json();
      console.log(`[轮询] 通过最终状态检查API获取到任务状态: ${finalStatus.status}`);
      return finalStatus;
    } catch (error) {
      console.error('[轮询] 通过最终状态检查API获取任务状态失败:', error);
      
      // 等待一段时间后再尝试备用API
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        // 备用方案：使用常规任务状态API
        console.log('[轮询] 尝试通过常规任务状态API获取状态');
        const backupResponse = await fetch(`/api/image-task-status/${taskId}`);
        
        if (!backupResponse.ok) {
          throw new Error(`HTTP error! status: ${backupResponse.status}`);
        }
        
        const backupStatus = await backupResponse.json();
        console.log(`[轮询] 通过常规API获取到任务状态: ${backupStatus.status}`);
        return backupStatus;
      } catch (backupError) {
        console.error('[轮询] 备用API获取任务状态也失败:', backupError);
        
        // 最后尝试：查询历史记录API
        try {
          console.log('[轮询] 尝试通过历史记录API查找任务');
          const historyResponse = await fetch('/api/image-history?limit=5');
          
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            
            if (historyData && historyData.history && historyData.history.length > 0) {
              // 查找匹配的任务
              const taskRecord = historyData.history.find((item: { task_id: string }) => item.task_id === taskId);
              
              if (taskRecord) {
                console.log(`[轮询] 在历史记录中找到任务: ${taskId}`);
                return {
                  status: taskRecord.status,
                  imageUrl: taskRecord.image_url,
                  taskId: taskRecord.task_id
                };
              }
            }
          }
        } catch (historyError) {
          console.error('[轮询] 通过历史记录API查找任务失败:', historyError);
        }
        
        // 所有尝试都失败，返回未知状态
        return { 
          status: 'unknown', 
          error: '无法通过任何方式获取任务状态' 
        };
      }
    }
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
        networkErrorsCount++;
        
        // 如果网络错误次数过多，尝试直接获取最终状态
        if (networkErrorsCount >= 3) {
          console.log('[轮询] 网络错误次数过多，尝试获取任务最终状态');
          try {
            const finalStatus = await getFinalTaskStatus(taskId);
            if (finalStatus.status === 'completed' || finalStatus.status === 'failed') {
              updateState(finalStatus.status);
              resolve({
                status: finalStatus.status,
                data: finalStatus,
                attempts,
                elapsedTime: Date.now() - startTime
              });
              return;
            }
          } catch (error) {
            console.error('[轮询] 获取任务最终状态失败:', error);
          }
        }
        
        // 等待网络恢复
        const networkRecovered = await waitForNetwork();
        if (!networkRecovered) {
          console.log('[轮询] 网络恢复等待超时，尝试继续轮询');
        }
        
        // 短暂延迟后继续
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
        if (onProgress) {
          // 优先使用API返回的实际进度数据
          if (result.progress !== undefined) {
            // 平滑处理进度
            const smoothedProgress = smoothProgress(
              taskProgressCache[taskId].lastProgress,
              result.progress,
              result.stage || 'processing'
            );
            
            onProgress(smoothedProgress, result.stage || 'processing');
          } 
          // 兼容旧版本：使用estimatedProgress字段
          else if (result.estimatedProgress !== undefined) {
            onProgress(result.estimatedProgress, result.processingStage || 'processing');
          }
          // 兼容极旧版本：使用等待时间估算
          else {
            const waitTime = result.waitTime || Math.floor((Date.now() - startTime) / 1000);
            const estimatedProgress = getEstimatedProgress(waitTime);
            const stage = getStageFromWaitTime(waitTime);
            onProgress(estimatedProgress, stage);
          }
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