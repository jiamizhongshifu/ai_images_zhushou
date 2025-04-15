/**
 * 任务本地存储管理工具
 * 用于在localStorage中存储、检索和管理图像生成任务信息
 */

// 存储键前缀和过期时间
const TASK_STORAGE_KEY = 'img_task_';
const TASK_LIST_KEY = 'img_task_list';
const TASK_EXPIRATION = 24 * 60 * 60 * 1000; // 24小时过期时间

// 任务信息接口
export interface StoredTaskInfo {
  taskId: string;
  params: any;
  timestamp: number;
  status?: string;
  lastChecked?: number;
  errorMessage?: string;
}

/**
 * 保存任务信息到本地存储
 */
export function savePendingTask(taskInfo: StoredTaskInfo): void {
  try {
    if (!taskInfo.taskId) {
      console.error('[任务存储] 无法保存任务，缺少taskId');
      return;
    }

    // 保存单个任务信息
    localStorage.setItem(
      `${TASK_STORAGE_KEY}${taskInfo.taskId}`,
      JSON.stringify({
        ...taskInfo,
        timestamp: taskInfo.timestamp || Date.now(),
        lastChecked: Date.now()
      })
    );
    
    // 更新任务列表
    const taskList = getTaskList();
    if (!taskList.includes(taskInfo.taskId)) {
      taskList.push(taskInfo.taskId);
      localStorage.setItem(TASK_LIST_KEY, JSON.stringify(taskList));
    }
    
    console.log(`[任务存储] 已保存任务 ${taskInfo.taskId} 到本地存储`);
  } catch (error) {
    console.error('[任务存储] 保存任务到本地存储失败:', error);
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
    const taskKey = `${TASK_STORAGE_KEY}${taskId}`;
    const rawTask = localStorage.getItem(taskKey);
    
    if (!rawTask) {
      console.warn(`[任务存储] 未找到任务 ${taskId}，无法更新状态`);
      return;
    }
    
    const task = JSON.parse(rawTask) as StoredTaskInfo;
    
    // 更新任务状态
    const updatedTask = {
      ...task,
      status,
      lastChecked: Date.now(),
      errorMessage: errorMessage || task.errorMessage
    };
    
    localStorage.setItem(taskKey, JSON.stringify(updatedTask));
    console.log(`[任务存储] 已更新任务 ${taskId} 状态为 ${status}`);
  } catch (error) {
    console.error(`[任务存储] 更新任务 ${taskId} 状态失败:`, error);
  }
}

/**
 * 获取指定任务信息
 */
export function getPendingTask(taskId: string): StoredTaskInfo | null {
  try {
    const taskKey = `${TASK_STORAGE_KEY}${taskId}`;
    const rawTask = localStorage.getItem(taskKey);
    
    if (!rawTask) {
      return null;
    }
    
    const task = JSON.parse(rawTask) as StoredTaskInfo;
    
    // 检查任务是否过期
    if (Date.now() - task.timestamp > TASK_EXPIRATION) {
      clearPendingTask(taskId);
      return null;
    }
    
    return task;
  } catch (error) {
    console.error(`[任务存储] 获取任务 ${taskId} 信息失败:`, error);
    return null;
  }
}

/**
 * 清除指定任务信息
 */
export function clearPendingTask(taskId: string): void {
  try {
    // 移除任务详情
    localStorage.removeItem(`${TASK_STORAGE_KEY}${taskId}`);
    
    // 从任务列表中移除
    const taskList = getTaskList().filter(id => id !== taskId);
    localStorage.setItem(TASK_LIST_KEY, JSON.stringify(taskList));
    
    console.log(`[任务存储] 已清除任务 ${taskId} 的本地存储`);
  } catch (error) {
    console.error(`[任务存储] 清除任务 ${taskId} 存储失败:`, error);
  }
}

/**
 * 获取任务列表
 */
function getTaskList(): string[] {
  try {
    const rawList = localStorage.getItem(TASK_LIST_KEY);
    return rawList ? JSON.parse(rawList) : [];
  } catch (error) {
    console.error('[任务存储] 获取任务列表失败:', error);
    return [];
  }
}

/**
 * 检查是否有未完成的任务
 */
export function checkPendingTasks(): StoredTaskInfo | null {
  try {
    // 获取所有任务ID
    const taskIds = getTaskList();
    
    // 如果没有存储的任务，直接返回null
    if (!taskIds.length) {
      return null;
    }
    
    const now = Date.now();
    let mostRecentTask: StoredTaskInfo | null = null;
    
    // 遍历所有任务，找出最近的任务并清理过期任务
    for (const taskId of taskIds) {
      const task = getPendingTask(taskId);
      
      if (!task) continue;
      
      // 如果任务已经完成或失败，清除它
      if (task.status === 'completed' || task.status === 'failed') {
        clearPendingTask(taskId);
        continue;
      }
      
      // 检查是否过期
      if (now - task.timestamp > TASK_EXPIRATION) {
        clearPendingTask(taskId);
        continue;
      }
      
      // 找出最近的任务
      if (!mostRecentTask || task.timestamp > mostRecentTask.timestamp) {
        mostRecentTask = task;
      }
    }
    
    return mostRecentTask;
  } catch (error) {
    console.error('[任务存储] 检查未完成任务失败:', error);
    return null;
  }
}

/**
 * 获取所有未完成的任务
 */
export function getAllPendingTasks(): StoredTaskInfo[] {
  try {
    const taskIds = getTaskList();
    const pendingTasks: StoredTaskInfo[] = [];
    const now = Date.now();
    
    for (const taskId of taskIds) {
      const task = getPendingTask(taskId);
      
      if (!task) continue;
      
      // 如果任务已经完成或失败，清除它
      if (task.status === 'completed' || task.status === 'failed') {
        clearPendingTask(taskId);
        continue;
      }
      
      // 检查是否过期
      if (now - task.timestamp > TASK_EXPIRATION) {
        clearPendingTask(taskId);
        continue;
      }
      
      pendingTasks.push(task);
    }
    
    return pendingTasks.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('[任务存储] 获取所有未完成任务失败:', error);
    return [];
  }
}

/**
 * 比较两个任务请求是否相同
 */
export function isSameRequest(task: StoredTaskInfo, newParams: any): boolean {
  if (!task || !task.params || !newParams) return false;
  
  // 比较基本参数
  const samePrompt = task.params.prompt === newParams.prompt;
  const sameStyle = task.params.style === newParams.style;
  
  // 如果都有图片，则认为不是相同请求（每次上传的图片通常不同）
  const bothHaveImage = !!task.params.image && !!newParams.image;
  
  // 如果基本参数相同且至少一个没有图片，则认为是相同请求
  return samePrompt && sameStyle && !bothHaveImage;
}

/**
 * 清理所有过期任务
 */
export function cleanupExpiredTasks(): void {
  try {
    const taskIds = getTaskList();
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const taskId of taskIds) {
      const taskKey = `${TASK_STORAGE_KEY}${taskId}`;
      const rawTask = localStorage.getItem(taskKey);
      
      if (!rawTask) {
        // 任务不存在，从列表中移除
        cleanedCount++;
        continue;
      }
      
      const task = JSON.parse(rawTask) as StoredTaskInfo;
      
      // 检查是否过期或已完成
      if (
        now - task.timestamp > TASK_EXPIRATION ||
        task.status === 'completed' ||
        task.status === 'failed'
      ) {
        localStorage.removeItem(taskKey);
        cleanedCount++;
      }
    }
    
    // 更新任务列表
    if (cleanedCount > 0) {
      const validTaskIds = taskIds.filter(id => 
        localStorage.getItem(`${TASK_STORAGE_KEY}${id}`) !== null
      );
      localStorage.setItem(TASK_LIST_KEY, JSON.stringify(validTaskIds));
      console.log(`[任务存储] 已清理 ${cleanedCount} 个过期任务`);
    }
  } catch (error) {
    console.error('[任务存储] 清理过期任务失败:', error);
  }
} 