/**
 * 任务轮询工具
 * 用于管理图像生成任务的状态轮询，支持指数退避策略和错误处理
 */

import { updatePendingTaskStatus } from './taskStorage';

// 轮询配置选项接口
export interface PollingOptions {
  maxAttempts?: number;         // 最大轮询次数
  initialInterval?: number;     // 初始轮询间隔(毫秒)
  maxInterval?: number;         // 最大轮询间隔(毫秒)
  exponentialFactor?: number;   // 指数增长因子
  failureRetries?: number;      // 连续失败重试次数
  onProgress?: (progress: number, stage: string) => void; // 进度回调
  onStateChange?: (state: PollingState) => void; // 状态变化回调
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
  options: PollingOptions = {}
): Promise<PollingResult> {
  // 默认配置和用户配置合并
  const {
    maxAttempts = 120,          // 默认最大尝试次数(10分钟)
    initialInterval = 2000,     // 初始间隔2秒
    maxInterval = 10000,        // 最大间隔10秒
    exponentialFactor = 1.5,    // 指数增长因子
    failureRetries = 0,         // 连续失败不进行重试
    onProgress,                 // 进度回调
    onStateChange               // 状态变化回调
  } = options;
  
  // 轮询状态
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
        const response = await fetch(`/api/image-task-status/${taskId}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store',
            'Pragma': 'no-cache'
          },
          // 为请求添加超时
          signal: AbortSignal.timeout 
            ? AbortSignal.timeout(15000) 
            : new AbortController().signal
        });
        
        // 检查响应状态
        if (!response.ok) {
          throw new Error(`状态请求失败: ${response.status}`);
        }
        
        // 重置网络错误计数
        networkErrorsCount = 0;
        
        // 解析响应数据
        const data = await response.json();
        
        // 重置连续失败计数
        consecutiveFailures = 0;
        
        // 更新任务本地存储状态
        updatePendingTaskStatus(taskId, data.status || 'processing');
        
        // 处理任务完成
        if (data.status === 'completed') {
          console.log(`[轮询] 任务${taskId}已完成`);
          updateState('completed');
          resolve({
            status: 'completed',
            data,
            attempts,
            elapsedTime: Date.now() - startTime
          });
          return;
        } 
        // 处理任务失败
        else if (data.status === 'failed') {
          console.log(`[轮询] 任务${taskId}失败: ${data.error || '未知错误'}`);
          updateState('failed');
          
          // 更新任务本地存储状态
          updatePendingTaskStatus(
            taskId, 
            'failed', 
            data.error || '图片生成失败'
          );
          
          reject({
            status: 'failed',
            error: data.error || '图片生成失败',
            attempts,
            elapsedTime: Date.now() - startTime
          });
          return;
        } 
        // 处理任务进行中
        else if (data.status === 'processing' || data.status === 'pending') {
          // 如果有进度信息和回调，更新进度
          if (data.waitTime && onProgress) {
            // 根据等待时间估算进度
            const estimatedProgress = getEstimatedProgress(data.waitTime);
            const stage = getStageFromWaitTime(data.waitTime);
            onProgress(estimatedProgress, stage);
          }
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
        
        // 动态调整轮询间隔（指数退避算法）
        if (attempts > 5) {
          currentInterval = Math.min(currentInterval * exponentialFactor, maxInterval);
        }
        
        // 安排下一次检查
        setTimeout(checkStatus, currentInterval);
        
      } catch (error) {
        console.error(`[轮询] 检查任务${taskId}状态失败:`, error);
        
        // 增加连续失败计数
        consecutiveFailures++;
        
        // 检查是否是网络错误
        const isNetworkError = error instanceof TypeError && 
          (error.message.includes('network') || 
           error.message.includes('fetch') || 
           error.message.includes('aborted'));
        
        if (isNetworkError) {
          networkErrorsCount++;
          console.log(`[轮询] 检测到网络错误 (${networkErrorsCount}次)`);
          
          // 如果连续网络错误超过3次，尝试等待网络恢复
          if (networkErrorsCount >= 3) {
            console.log('[轮询] 连续网络错误，等待网络恢复...');
            
            // 尝试等待网络恢复
            waitForNetworkReconnection().then(() => {
              // 网络恢复后重置错误计数并立即尝试重新连接
              networkErrorsCount = 0;
              setTimeout(checkStatus, 1000);
            });
            
            return;
          }
        }
        
        // 如果连续失败次数超过阈值，使用保守策略
        if (consecutiveFailures > failureRetries) {
          // 连续多次失败，但不立即放弃，转为更保守的轮询策略
          consecutiveFailures = 1; // 重置为1而不是0，保持警惕
          currentInterval = maxInterval; // 使用最大间隔
          console.log(`[轮询] 切换到保守轮询策略，间隔${maxInterval}ms`);
        }
        
        // 检查是否达到最大尝试次数
        if (attempts >= maxAttempts) {
          updateState('timeout');
          reject({
            status: 'timeout',
            error: '轮询超时',
            attempts,
            elapsedTime: Date.now() - startTime
          });
        } else {
          // 继续轮询，但使用更长的间隔
          const retryInterval = Math.min(currentInterval * 2, maxInterval);
          setTimeout(checkStatus, retryInterval);
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