/**
 * 通知工具函数
 * 简单实现，在控制台输出消息
 */

/**
 * 显示通知消息
 * @param message 消息内容
 * @param type 消息类型：success, error, info
 */
export function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  // 在实际应用中可以使用toast库或其他通知组件
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// 为了与hooks/useImageGeneration.ts中的notify兼容
export function notify(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  showNotification(message, type);
}

// 导出类型定义
export type NotificationType = 'success' | 'error' | 'info'; 