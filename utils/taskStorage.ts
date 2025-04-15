/**
 * 图片生成任务本地存储管理工具
 * 用于管理用户浏览器本地的图片生成任务状态
 */

import { PendingTask, TaskStatus } from '@/types/task';
import { TASK_CONFIG } from '@/constants/taskConfig';

// 本地存储键名
const PENDING_TASKS_KEY = 'pendingImageTasks';

/**
 * 安全地访问localStorage
 * @param action 要执行的操作函数
 * @param fallback 失败时的返回值
 */
function safeLocalStorage<T>(action: () => T, fallback: T): T {
  try {
    // 检查localStorage是否可用
    if (typeof window === 'undefined' || !window.localStorage) {
      console.warn('[taskStorage] localStorage不可用，可能在SSR环境中');
      return fallback;
    }
    
    return action();
  } catch (error) {
    console.error('[taskStorage] 访问localStorage时出错:', error);
    return fallback;
  }
}

/**
 * 保存待处理任务到本地存储
 */
export function savePendingTask(task: PendingTask): void {
  safeLocalStorage(() => {
    // 获取现有任务列表
    const existingTasksJson = localStorage.getItem(PENDING_TASKS_KEY);
    let tasks: PendingTask[] = [];
    
    if (existingTasksJson) {
      tasks = JSON.parse(existingTasksJson);
      
      // 如果任务已存在，更新它
      const existingIndex = tasks.findIndex(t => t.taskId === task.taskId);
      if (existingIndex >= 0) {
        tasks[existingIndex] = { ...tasks[existingIndex], ...task };
      } else {
        // 添加新任务
        tasks.push(task);
      }
    } else {
      // 第一个任务
      tasks = [task];
    }
    
    // 限制最多保存10个任务
    if (tasks.length > 10) {
      // 按时间排序，保留最近的10个
      tasks.sort((a, b) => b.timestamp - a.timestamp);
      tasks = tasks.slice(0, 10);
    }
    
    // 保存到本地存储
    localStorage.setItem(PENDING_TASKS_KEY, JSON.stringify(tasks));
    console.log(`[taskStorage] 已保存任务 ${task.taskId} 到本地存储`);
    
    return true;
  }, false);
}

/**
 * 从本地存储中获取所有待处理任务
 */
export function getAllPendingTasks(): PendingTask[] {
  return safeLocalStorage(() => {
    const tasksJson = localStorage.getItem(PENDING_TASKS_KEY);
    if (!tasksJson) return [];
    
    const tasks = JSON.parse(tasksJson);
    return Array.isArray(tasks) ? tasks : [];
  }, []);
}

/**
 * 从本地存储中获取特定任务
 */
export function getPendingTask(taskId: string): PendingTask | null {
  return safeLocalStorage(() => {
    const tasks = getAllPendingTasks();
    return tasks.find(task => task.taskId === taskId) || null;
  }, null);
}

/**
 * 根据创建时间检查任务是否过期
 */
export function isTaskExpired(task: PendingTask): boolean {
  const now = Date.now();
  const taskAge = now - task.timestamp;
  // 超过6小时的任务视为过期
  return taskAge > 6 * 60 * 60 * 1000; // 6小时过期时间
}

/**
 * 更新任务状态
 */
export function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  error?: string
): void {
  safeLocalStorage(() => {
    const task = getPendingTask(taskId);
    if (!task) return false;

    // 如果任务已经处于完成状态，不再更新
    if ([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(task.status)) {
      console.log(`[taskStorage] 任务 ${taskId} 已处于终态 ${task.status}，跳过更新`);
      return false;
    }

    // 更新状态
    task.status = status;
    if (error) task.errorMessage = error;
    task.lastUpdated = Date.now();

    // 保存更新后的任务
    savePendingTask(task);

    // 如果任务完成或失败，延迟清理
    if ([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(status)) {
      setTimeout(() => {
        clearPendingTask(taskId);
      }, 5 * 60 * 1000); // 5分钟后清理，给用户足够时间查看结果
    }
    
    return true;
  }, false);
}

/**
 * 清除特定任务
 */
export function clearPendingTask(taskId: string): void {
  safeLocalStorage(() => {
    const tasks = getAllPendingTasks();
    const filteredTasks = tasks.filter(task => task.taskId !== taskId);
    
    if (filteredTasks.length === tasks.length) {
      console.warn(`[taskStorage] 任务 ${taskId} 不存在，无需清除`);
      return false;
    }
    
    localStorage.setItem(PENDING_TASKS_KEY, JSON.stringify(filteredTasks));
    console.log(`[taskStorage] 已清除任务 ${taskId}`);
    return true;
  }, false);
}

/**
 * 清理过期任务
 */
export function cleanupExpiredTasks(): void {
  safeLocalStorage(() => {
    const tasks = getAllPendingTasks();
    const validTasks = tasks.filter(task => !isTaskExpired(task));
    
    if (validTasks.length < tasks.length) {
      localStorage.setItem(PENDING_TASKS_KEY, JSON.stringify(validTasks));
      console.log(`[taskStorage] 已清理 ${tasks.length - validTasks.length} 个过期任务`);
    }
    
    return true;
  }, false);
}

/**
 * 检查两个任务请求是否相同
 */
export function isSameRequest(task1: PendingTask, task2: Record<string, any>): boolean {
  if (!task1 || !task2) return false;
  
  // 比较关键参数
  const keysToCompare = ['prompt', 'style', 'aspectRatio'];
  
  for (const key of keysToCompare) {
    if (task1.params[key] !== task2[key]) {
      return false;
    }
  }
  
  // 比较图像（如果有）
  if (task1.params.image && task2.image) {
    // 图像内容较大，只比较前100个字符和长度
    const img1 = task1.params.image;
    const img2 = task2.image;
    
    if (typeof img1 === 'string' && typeof img2 === 'string') {
      const prefix1 = img1.substring(0, 100);
      const prefix2 = img2.substring(0, 100);
      if (prefix1 !== prefix2 || img1.length !== img2.length) {
        return false;
      }
    }
  }
  
  return true;
} 