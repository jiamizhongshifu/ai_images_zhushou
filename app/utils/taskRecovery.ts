/**
 * 任务恢复功能
 * 处理应用程序关闭或网络中断期间未完成的任务
 */

// 定义挂起任务的接口
export interface PendingTask {
  id: string;
  prompt: string;
  style: string;
  uploadedImage?: string | null;
  timestamp: number;
  attemptCount: number;
}

// 本地存储的键名
const PENDING_TASKS_KEY = 'img-tutu:pending-tasks';

/**
 * 保存挂起的任务到本地存储
 */
export const savePendingTask = (task: PendingTask): void => {
  try {
    const existingTasksStr = localStorage.getItem(PENDING_TASKS_KEY);
    const existingTasks: PendingTask[] = existingTasksStr ? JSON.parse(existingTasksStr) : [];
    
    // 检查是否已有相同ID的任务
    const taskIndex = existingTasks.findIndex(t => t.id === task.id);
    
    if (taskIndex >= 0) {
      // 更新现有任务
      existingTasks[taskIndex] = {
        ...task,
        attemptCount: (existingTasks[taskIndex].attemptCount || 0) + 1
      };
    } else {
      // 添加新任务
      existingTasks.push({
        ...task,
        attemptCount: 1
      });
    }
    
    // 只保留最近的10个任务
    const recentTasks = existingTasks
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);
    
    localStorage.setItem(PENDING_TASKS_KEY, JSON.stringify(recentTasks));
    console.log(`[TaskRecovery] 已保存挂起任务: ${task.id}, 当前挂起任务总数: ${recentTasks.length}`);
  } catch (error) {
    console.error('[TaskRecovery] 保存挂起任务失败:', error);
  }
};

/**
 * 获取所有挂起的任务
 */
export const getPendingTasks = (): PendingTask[] => {
  try {
    const tasksStr = localStorage.getItem(PENDING_TASKS_KEY);
    const tasks: PendingTask[] = tasksStr ? JSON.parse(tasksStr) : [];
    return tasks;
  } catch (error) {
    console.error('[TaskRecovery] 获取挂起任务失败:', error);
    return [];
  }
};

/**
 * 移除挂起的任务
 */
export const removePendingTask = (taskId: string): void => {
  try {
    const existingTasksStr = localStorage.getItem(PENDING_TASKS_KEY);
    if (!existingTasksStr) return;
    
    const existingTasks: PendingTask[] = JSON.parse(existingTasksStr);
    const updatedTasks = existingTasks.filter(task => task.id !== taskId);
    
    localStorage.setItem(PENDING_TASKS_KEY, JSON.stringify(updatedTasks));
    console.log(`[TaskRecovery] 已移除挂起任务: ${taskId}, 剩余挂起任务总数: ${updatedTasks.length}`);
  } catch (error) {
    console.error('[TaskRecovery] 移除挂起任务失败:', error);
  }
};

/**
 * 清除所有挂起的任务
 */
export const clearAllPendingTasks = (): void => {
  try {
    localStorage.removeItem(PENDING_TASKS_KEY);
    console.log('[TaskRecovery] 已清除所有挂起任务');
  } catch (error) {
    console.error('[TaskRecovery] 清除所有挂起任务失败:', error);
  }
}; 