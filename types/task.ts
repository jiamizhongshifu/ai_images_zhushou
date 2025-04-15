/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'pending',    // 等待处理
  PROCESSING = 'processing', // 处理中
  COMPLETED = 'completed',   // 已完成
  FAILED = 'failed',      // 失败
  CANCELLED = 'cancelled'    // 已取消
}

/**
 * 任务对象接口
 */
export interface Task {
  id: string;            // 任务ID
  user_id: string;       // 用户ID
  prompt: string;        // 提示词
  status: TaskStatus;    // 任务状态
  result_url?: string;   // 结果URL(如果完成)
  error_message?: string; // 错误信息(如果失败)
  created_at: string;    // 创建时间
  updated_at?: string;   // 更新时间
  parameters?: Record<string, any>; // 任务参数
}

export interface PendingTask {
  taskId: string;
  status: string;
  timestamp: number;
  lastUpdated?: number;
  params: any;
  error?: string;
  errorMessage?: string;
  auto_recovering?: boolean; // 标记任务是否正在自动恢复中
}

export interface TaskUpdatePayload {
  status: string;
  progress?: number;
  stage?: string;
  error?: string;
  result?: any;
}

export interface TaskPollingResult {
  status: string;
  data?: any;
  error?: string;
  attempts: number;
  elapsedTime: number;
} 