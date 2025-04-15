/**
 * 任务恢复管理工具 - 用于管理浏览器本地存储中的任务状态
 */

import { v4 as uuid } from 'uuid';

// 常量
const TASKS_STORAGE_KEY = 'pending_image_tasks';
const TASK_EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24小时

// 任务状态类型
export type TaskStatus = 
  | 'created'
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'recovering'
  | 'error';

// 任务结构接口
export interface PendingTask {
  taskId: string;
  params: {
    prompt: string;
    style?: string;
    aspectRatio?: string | null;
    standardAspectRatio?: string | null;
    // 不再存储image数据，减少本地存储大小
    hasImage?: boolean; // 只记录是否有图片，不存储图片数据
  };
  timestamp: number;
  lastUpdated?: number;
  status: TaskStatus;
  error?: string;
  errorMessage?: string;
  auto_recovering?: boolean; // 标记任务是否正在自动恢复中
}

/**
 * 保存待处理任务到本地存储
 */
export function savePendingTask(task: PendingTask): void {
  try {
    // 清理可能存在的大数据
    if (task.params) {
      // 记录是否有图片但不存储图片数据
      const hasImage = !!(task.params as any).image;
      if (hasImage) {
        // 创建新对象，避免修改原始对象
        let cleanParams = { ...task.params };
        // 使用类型断言来访问和删除image属性
        delete (cleanParams as any).image;
        // 设置hasImage标志
        cleanParams.hasImage = true;
        // 更新task对象中的params
        task = { ...task, params: cleanParams };
      }
    }
    
    const existingTasks = getAllPendingTasks();
    const taskIndex = existingTasks.findIndex(t => t.taskId === task.taskId);
    
    if (taskIndex >= 0) {
      // 更新现有任务
      existingTasks[taskIndex] = {
        ...existingTasks[taskIndex],
        ...task,
        lastUpdated: Date.now()
      };
    } else {
      // 添加新任务
      existingTasks.push({
        ...task,
        lastUpdated: Date.now()
      });
    }
    
    // 保存回本地存储
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(existingTasks));
    console.log(`[任务恢复] 已保存任务 ${task.taskId} 到本地存储`);
    
  } catch (error) {
    console.error('[任务恢复] 保存任务失败:', error);
    
    // 如果是存储配额问题，尝试清理旧任务再保存
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      try {
        console.warn('[任务恢复] 存储配额已满，尝试清理旧任务');
        const existingTasks = getAllPendingTasks();
        
        // 只保留最新的5个任务
        const recentTasks = existingTasks
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 5);
        
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(recentTasks));
        
        // 再次尝试保存当前任务
        savePendingTask(task);
      } catch (retryError) {
        console.error('[任务恢复] 清理后再次保存任务失败:', retryError);
      }
    }
  }
}

/**
 * 从本地存储中获取所有待处理任务
 */
export function getAllPendingTasks(): PendingTask[] {
  try {
    const taskData = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!taskData) return [];
    
    return JSON.parse(taskData);
  } catch (error) {
    console.error('[任务恢复] 获取所有任务失败:', error);
    return [];
  }
}

/**
 * 从本地存储中获取特定任务
 */
export function getPendingTask(taskId: string): PendingTask | null {
  try {
    const existingTasks = getAllPendingTasks();
    return existingTasks.find(task => task.taskId === taskId) || null;
  } catch (error) {
    console.error('[任务恢复] 获取任务失败:', error);
    return null;
  }
}

/**
 * 检查任务是否过期
 */
export function isTaskExpired(task: PendingTask): boolean {
  return Date.now() - task.timestamp > TASK_EXPIRATION_TIME;
}

/**
 * 检查任务是否活跃
 */
export function isTaskActive(task: PendingTask): boolean {
  return ['pending', 'processing', 'created', 'recovering'].includes(task.status);
}

/**
 * 增强的任务恢复检查
 */
export function shouldRecoverTask(task: PendingTask): boolean {
  // 只有pending或processing状态的任务才应该被恢复
  if (!['pending', 'processing', 'created'].includes(task.status)) {
    return false;
  }
  
  // 任务不应该太旧
  const taskAge = Date.now() - task.timestamp;
  if (taskAge > 12 * 60 * 60 * 1000) { // 12小时
    return false;
  }
  
  return true;
}

/**
 * 增强的任务状态更新
 */
export function updateTaskStatus(
  taskId: string, 
  status: TaskStatus, 
  errorMessage?: string
): void {
  try {
    const existingTasks = getAllPendingTasks();
    const taskIndex = existingTasks.findIndex(t => t.taskId === taskId);
    
    if (taskIndex >= 0) {
      existingTasks[taskIndex] = {
        ...existingTasks[taskIndex],
        status,
        lastUpdated: Date.now(),
        ...(errorMessage ? { errorMessage } : {})
      };
      
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(existingTasks));
      console.log(`[任务恢复] 已更新任务 ${taskId} 状态为 ${status}`);
    }
  } catch (error) {
    console.error('[任务恢复] 更新任务状态失败:', error);
  }
}

/**
 * 清除特定任务
 */
export function clearPendingTask(taskId: string): void {
  try {
    const existingTasks = getAllPendingTasks();
    const updatedTasks = existingTasks.filter(task => task.taskId !== taskId);
    
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(updatedTasks));
    console.log(`[任务恢复] 已清除任务 ${taskId}`);
  } catch (error) {
    console.error('[任务恢复] 清除任务失败:', error);
  }
}

/**
 * 清除所有待处理任务
 */
export function clearAllPendingTasks(): void {
  try {
    localStorage.removeItem(TASKS_STORAGE_KEY);
    console.log('[任务恢复] 已清除所有待处理任务');
  } catch (error) {
    console.error('[任务恢复] 清除所有待处理任务失败:', error);
  }
}

/**
 * 清理过期任务（超过24小时）
 */
export function cleanupExpiredTasks(): void {
  try {
    const existingTasks = getAllPendingTasks();
    const now = Date.now();
    
    // 过滤掉过期的任务
    const validTasks = existingTasks.filter(task => {
      const isExpired = now - task.timestamp > TASK_EXPIRATION_TIME;
      // 已完成或失败的任务保留12小时
      const completedExpiry = 12 * 60 * 60 * 1000;
      const isCompletedExpired = ['completed', 'failed', 'cancelled'].includes(task.status) && 
        now - task.timestamp > completedExpiry;
      
      return !isExpired && !isCompletedExpired;
    });
    
    if (validTasks.length !== existingTasks.length) {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(validTasks));
      console.log(`[任务恢复] 已清理 ${existingTasks.length - validTasks.length} 个过期任务`);
    }
  } catch (error) {
    console.error('[任务恢复] 清理过期任务失败:', error);
  }
}

/**
 * 检查当前是否有活跃的待处理任务
 */
export function hasActivePendingTasks(): boolean {
  try {
    const tasks = getAllPendingTasks();
    const now = Date.now();
    const ACTIVE_TIME = 24 * 60 * 60 * 1000; // 24小时内的任务视为活跃
    
    return tasks.some(task => {
      // 只有处理中和等待中的任务才算活跃
      const isActiveStatus = ['pending', 'processing', 'created'].includes(task.status);
      const isRecent = now - task.timestamp < ACTIVE_TIME;
      return isActiveStatus && isRecent;
    });
  } catch (error) {
    console.error('[任务恢复] 检查活跃任务失败:', error);
    return false;
  }
}

/**
 * 创建图片指纹，用于比较图片是否相同
 * 简化版的图片特征提取，只取前5000个字符进行哈希计算
 */
function createImageFingerprint(imageBase64: string | null | undefined): string {
  if (!imageBase64) return '';
  const sampleLength = 5000; // 只取前5000个字符作为特征
  return imageBase64.substring(0, Math.min(sampleLength, imageBase64.length));
}

/**
 * 增强版 - 判断两个请求是否相同
 * 考虑更多因素进行精确匹配
 */
export function isSameRequest(
  taskOrParams: any, 
  newParams: any
): boolean {
  // 获取参数对象，无论是从任务中还是直接参数
  const oldParams = taskOrParams.params || taskOrParams;
  
  // 处理null和undefined情况
  if (!oldParams || !newParams) return false;
  
  // 检查提示词、风格和比例是否相同
  const isSamePrompt = oldParams.prompt?.trim() === newParams.prompt?.trim();
  const isSameStyle = oldParams.style === newParams.style;
  const isSameRatio = oldParams.aspectRatio === newParams.aspectRatio;
  
  // 图片检查 - 只比较是否都有或都没有图片，不比较图片内容
  const oldHasImage = !!(oldParams.hasImage || (oldParams as any).image);
  const newHasImage = !!(newParams.hasImage || newParams.image);
  const isSameImageState = oldHasImage === newHasImage;
  
  // 至少有一个不同才返回false
  return isSamePrompt && isSameStyle && isSameRatio && isSameImageState;
} 