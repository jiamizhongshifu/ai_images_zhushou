/**
 * 任务同步管理器
 * 
 * 用于在多个标签页之间同步任务状态，防止重复提交
 * 使用 sessionStorage 和 broadcastChannel API 实现跨标签页通信
 */

// 任务状态类型
export type TaskStatus = 'idle' | 'processing' | 'completed' | 'failed' | 'error';

// 任务信息接口
export interface TaskInfo {
  taskId: string;
  timestamp: number;
  status: TaskStatus;
  params?: Record<string, any>;
}

// 存储键
const TASK_INFO_KEY = 'image_generation_task_info';
const SUBMIT_LOCK_KEY = 'image_generation_submit_lock';

// 广播频道名称
const BROADCAST_CHANNEL_NAME = 'image_task_sync';

// 消息类型
type MessageType = 'task_update' | 'task_complete' | 'task_failed' | 'submit_lock';

// 消息接口
interface SyncMessage {
  type: MessageType;
  data: any;
  timestamp: number;
}

// 初始化广播通道
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
} catch (e) {
  console.warn('[TaskSync] BroadcastChannel API不可用', e);
}

/**
 * 任务同步管理器
 */
export const TaskSyncManager = {
  /**
   * 记录正在执行的任务
   */
  recordTask: (taskInfo: TaskInfo): void => {
    try {
      // 保存到sessionStorage
      sessionStorage.setItem(TASK_INFO_KEY, JSON.stringify(taskInfo));
      
      // 广播任务更新
      TaskSyncManager.broadcast({
        type: 'task_update',
        data: taskInfo,
        timestamp: Date.now()
      });
      
      console.log(`[TaskSync] 记录任务: ${taskInfo.taskId}, 状态: ${taskInfo.status}`);
    } catch (error) {
      console.error('[TaskSync] 记录任务失败:', error);
    }
  },
  
  /**
   * 更新任务状态
   */
  updateTaskStatus: (taskId: string, status: TaskStatus): void => {
    try {
      const taskInfoStr = sessionStorage.getItem(TASK_INFO_KEY);
      if (!taskInfoStr) return;
      
      const taskInfo: TaskInfo = JSON.parse(taskInfoStr);
      if (taskInfo.taskId !== taskId) return;
      
      // 更新状态
      taskInfo.status = status;
      sessionStorage.setItem(TASK_INFO_KEY, JSON.stringify(taskInfo));
      
      // 广播状态更新
      TaskSyncManager.broadcast({
        type: 'task_update',
        data: taskInfo,
        timestamp: Date.now()
      });
      
      console.log(`[TaskSync] 更新任务状态: ${taskId} -> ${status}`);
      
      // 如果任务完成或失败，在一定时间后清除
      if (status === 'completed' || status === 'failed' || status === 'error') {
        setTimeout(() => {
          TaskSyncManager.clearTask(taskId);
        }, 60000); // 1分钟后清除
      }
    } catch (error) {
      console.error('[TaskSync] 更新任务状态失败:', error);
    }
  },
  
  /**
   * 清除任务
   */
  clearTask: (taskId: string): void => {
    try {
      const taskInfoStr = sessionStorage.getItem(TASK_INFO_KEY);
      if (!taskInfoStr) return;
      
      const taskInfo: TaskInfo = JSON.parse(taskInfoStr);
      if (taskInfo.taskId !== taskId) return;
      
      // 清除任务
      sessionStorage.removeItem(TASK_INFO_KEY);
      
      console.log(`[TaskSync] 清除任务: ${taskId}`);
    } catch (error) {
      console.error('[TaskSync] 清除任务失败:', error);
    }
  },
  
  /**
   * 获取当前任务
   */
  getCurrentTask: (): TaskInfo | null => {
    try {
      const taskInfoStr = sessionStorage.getItem(TASK_INFO_KEY);
      if (!taskInfoStr) return null;
      
      return JSON.parse(taskInfoStr);
    } catch (error) {
      console.error('[TaskSync] 获取当前任务失败:', error);
      return null;
    }
  },
  
  /**
   * 检查是否可以提交新任务
   */
  canSubmitTask: (): boolean => {
    try {
      // 检查提交锁
      const lockTimeStr = sessionStorage.getItem(SUBMIT_LOCK_KEY);
      if (lockTimeStr) {
        const lockTime = parseInt(lockTimeStr);
        // 如果锁定时间在10秒内，不允许提交
        if (Date.now() - lockTime < 10000) {
          return false;
        }
      }
      
      // 检查当前任务
      const taskInfo = TaskSyncManager.getCurrentTask();
      if (taskInfo) {
        // 如果任务状态为处理中且在5分钟内创建的，不允许提交
        if (taskInfo.status === 'processing' && 
            Date.now() - taskInfo.timestamp < 5 * 60 * 1000) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('[TaskSync] 检查提交状态失败:', error);
      return true; // 出错时默认允许提交
    }
  },
  
  /**
   * 检查当前是否有提交锁定
   */
  hasSubmissionLock: (): boolean => {
    try {
      const lockTimeStr = sessionStorage.getItem(SUBMIT_LOCK_KEY);
      if (!lockTimeStr) return false;
      
      const lockTime = parseInt(lockTimeStr);
      // 如果锁定时间在5秒内，认为有活跃锁定
      return Date.now() - lockTime < 5000;
    } catch (error) {
      console.error('[TaskSync] 检查提交锁定状态失败:', error);
      return false; // 出错时默认无锁定
    }
  },
  
  /**
   * 设置提交锁定
   */
  setSubmitLock: (): void => {
    try {
      sessionStorage.setItem(SUBMIT_LOCK_KEY, Date.now().toString());
      
      // 广播锁定消息
      TaskSyncManager.broadcast({
        type: 'submit_lock',
        data: { locked: true },
        timestamp: Date.now()
      });
      
      console.log('[TaskSync] 设置提交锁定');
    } catch (error) {
      console.error('[TaskSync] 设置提交锁定失败:', error);
    }
  },
  
  /**
   * 广播消息到其他标签页
   */
  broadcast: (message: SyncMessage): void => {
    try {
      if (broadcastChannel) {
        broadcastChannel.postMessage(message);
      }
    } catch (error) {
      console.error('[TaskSync] 广播消息失败:', error);
    }
  },
  
  /**
   * 初始化消息监听
   */
  initListener: (callbacks: {
    onTaskUpdate?: (taskInfo: TaskInfo) => void;
    onSubmitLock?: () => void;
  }): () => void => {
    if (!broadcastChannel) return () => {};
    
    const listener = (event: MessageEvent) => {
      try {
        const message: SyncMessage = event.data;
        
        switch (message.type) {
          case 'task_update':
            if (callbacks.onTaskUpdate) {
              callbacks.onTaskUpdate(message.data);
            }
            break;
            
          case 'submit_lock':
            if (callbacks.onSubmitLock) {
              callbacks.onSubmitLock();
            }
            break;
        }
      } catch (error) {
        console.error('[TaskSync] 处理消息失败:', error);
      }
    };
    
    broadcastChannel.addEventListener('message', listener);
    
    // 返回清理函数
    return () => {
      broadcastChannel?.removeEventListener('message', listener);
    };
  }
};

export default TaskSyncManager; 