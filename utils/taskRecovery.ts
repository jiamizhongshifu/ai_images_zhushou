/**
 * 任务恢复管理工具 - 用于管理浏览器本地存储中的任务状态
 */

const PENDING_TASKS_KEY = 'pendingImageTasks';

export interface PendingTask {
  taskId: string;
  params: any;
  timestamp: number;
  status: string;
  errorMessage?: string;
}

/**
 * 保存待处理任务到本地存储
 */
export function savePendingTask(task: PendingTask): void {
  try {
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
    console.log(`[任务恢复] 已保存任务 ${task.taskId} 到本地存储`);
  } catch (error) {
    console.error('[任务恢复] 保存任务到本地存储失败:', error);
  }
}

/**
 * 从本地存储中获取所有待处理任务
 */
export function getAllPendingTasks(): PendingTask[] {
  try {
    const tasksJson = localStorage.getItem(PENDING_TASKS_KEY);
    if (!tasksJson) return [];
    
    return JSON.parse(tasksJson);
  } catch (error) {
    console.error('[任务恢复] 获取待处理任务失败:', error);
    return [];
  }
}

/**
 * 从本地存储中获取特定任务
 */
export function getPendingTask(taskId: string): PendingTask | null {
  try {
    const tasks = getAllPendingTasks();
    return tasks.find(task => task.taskId === taskId) || null;
  } catch (error) {
    console.error(`[任务恢复] 获取任务 ${taskId} 失败:`, error);
    return null;
  }
}

/**
 * 更新任务状态
 */
export function updatePendingTaskStatus(
  taskId: string, 
  status: string, 
  errorMessage?: string
): void {
  try {
    const task = getPendingTask(taskId);
    if (!task) {
      console.warn(`[任务恢复] 任务 ${taskId} 不存在，无法更新状态`);
      return;
    }
    
    // 更新任务状态
    savePendingTask({
      ...task,
      status,
      timestamp: Date.now(), // 更新时间戳
      errorMessage: errorMessage || task.errorMessage
    });
    
    console.log(`[任务恢复] 已更新任务 ${taskId} 状态为 ${status}`);
  } catch (error) {
    console.error(`[任务恢复] 更新任务 ${taskId} 状态失败:`, error);
  }
}

/**
 * 清除特定任务
 */
export function clearPendingTask(taskId: string): void {
  try {
    const tasks = getAllPendingTasks();
    const filteredTasks = tasks.filter(task => task.taskId !== taskId);
    
    if (filteredTasks.length === tasks.length) {
      console.warn(`[任务恢复] 任务 ${taskId} 不存在，无需清除`);
      return;
    }
    
    localStorage.setItem(PENDING_TASKS_KEY, JSON.stringify(filteredTasks));
    console.log(`[任务恢复] 已清除任务 ${taskId}`);
  } catch (error) {
    console.error(`[任务恢复] 清除任务 ${taskId} 失败:`, error);
  }
}

/**
 * 清除所有待处理任务
 */
export function clearAllPendingTasks(): void {
  try {
    localStorage.removeItem(PENDING_TASKS_KEY);
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
    const tasks = getAllPendingTasks();
    const now = Date.now();
    const EXPIRE_TIME = 24 * 60 * 60 * 1000; // 24小时
    
    const validTasks = tasks.filter(task => {
      return now - task.timestamp < EXPIRE_TIME;
    });
    
    if (validTasks.length < tasks.length) {
      localStorage.setItem(PENDING_TASKS_KEY, JSON.stringify(validTasks));
      console.log(`[任务恢复] 已清理 ${tasks.length - validTasks.length} 个过期任务`);
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
 * 判断两个请求是否相同
 */
export function isSameRequest(task: PendingTask, params: any): boolean {
  if (!task.params || !params) return false;
  
  // 比较关键参数
  return (
    task.params.prompt === params.prompt &&
    task.params.style === params.style &&
    (task.params.image === params.image || (!task.params.image && !params.image))
  );
} 