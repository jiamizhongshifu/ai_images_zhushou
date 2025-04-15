export const TASK_CONFIG = {
  // 时间配置（毫秒）
  FRONTEND_TIMEOUT: 300000,      // 5分钟
  BACKEND_TIMEOUT: 360000,       // 6分钟
  POLLING_INTERVAL: 3000,        // 3秒
  POLLING_MAX_ATTEMPTS: 100,     // 最大轮询次数
  
  // 任务状态
  TASK_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  },
  
  // 生成阶段
  GENERATION_STAGES: {
    PREPARING: 'preparing',
    CONFIGURING: 'configuring',
    SENDING_REQUEST: 'sending_request',
    PROCESSING: 'processing',
    FINALIZING: 'finalizing',
    COMPLETED: 'completed',
    FAILED: 'failed'
  }
}; 