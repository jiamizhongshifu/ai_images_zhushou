"use client";

import { PendingTask, getPendingTask, updatePendingTaskStatus, clearPendingTask } from './taskRecovery';
import useNotification from '@/hooks/useNotification';

interface RecoveryOptions {
  onBeforeRecovery?: () => void;
  onSuccess?: (imageUrl: string) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: string, data: any) => void;
}

/**
 * 任务恢复服务 - 用于恢复未完成的任务
 */
export default class TaskRecoveryService {
  private static instance: TaskRecoveryService;
  private showNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  
  private constructor() {
    // 获取通知服务
    const { showNotification } = useNotification();
    this.showNotification = showNotification;
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(): TaskRecoveryService {
    if (!TaskRecoveryService.instance) {
      TaskRecoveryService.instance = new TaskRecoveryService();
    }
    return TaskRecoveryService.instance;
  }
  
  /**
   * 恢复任务处理
   */
  public async recoverTask(task: PendingTask, options: RecoveryOptions = {}): Promise<void> {
    const { onBeforeRecovery, onSuccess, onError, onStatusChange } = options;
    
    try {
      // 执行前置回调
      if (onBeforeRecovery) {
        onBeforeRecovery();
      }
      
      // 更新任务状态
      updatePendingTaskStatus(task.taskId, 'recovering');
      
      // 检查任务状态
      const response = await fetch(`/api/image-task-status/${task.taskId}`);
      
      if (!response.ok) {
        throw new Error(`检查任务状态失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 根据任务状态处理
      switch (data.status) {
        case 'completed':
          // 任务已完成，直接显示结果
          if (onStatusChange) {
            onStatusChange('completed', data);
          }
          if (onSuccess && data.imageUrl) {
            onSuccess(data.imageUrl);
          }
          clearPendingTask(task.taskId);
          this.showNotification('任务已完成', 'success');
          break;
          
        case 'failed':
          // 任务失败，显示错误
          if (onStatusChange) {
            onStatusChange('failed', data);
          }
          if (onError) {
            onError(data.error || '任务处理失败');
          }
          clearPendingTask(task.taskId);
          this.showNotification(`任务处理失败: ${data.error || '未知错误'}`, 'error');
          break;
          
        case 'cancelled':
          // 任务已取消
          if (onStatusChange) {
            onStatusChange('cancelled', data);
          }
          clearPendingTask(task.taskId);
          this.showNotification('任务已被取消', 'info');
          break;
          
        case 'pending':
        case 'processing':
          // 任务仍在进行中，添加SSE监听
          if (onStatusChange) {
            onStatusChange(data.status, data);
          }
          this.showNotification(`继续监听任务状态，当前状态: ${data.status}`, 'info');
          
          // 任务仍在进行，不需要其他操作，由TaskStatusListener组件接管后续处理
          break;
          
        default:
          // 未知状态，视为错误
          if (onError) {
            onError(`未知任务状态: ${data.status}`);
          }
          updatePendingTaskStatus(task.taskId, 'error', `未知任务状态: ${data.status}`);
          this.showNotification(`未知任务状态: ${data.status}`, 'error');
          break;
      }
    } catch (error) {
      // 处理错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('恢复任务失败:', errorMessage);
      
      if (onError) {
        onError(errorMessage);
      }
      
      updatePendingTaskStatus(task.taskId, 'error', errorMessage);
      this.showNotification(`恢复任务失败: ${errorMessage}`, 'error');
    }
  }
  
  /**
   * 放弃任务
   */
  public discardTask(taskId: string): void {
    clearPendingTask(taskId);
    this.showNotification('已放弃任务', 'info');
  }
} 