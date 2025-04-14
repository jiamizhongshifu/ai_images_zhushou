/**
 * 追踪工具函数
 * 简单实现，记录提示词使用情况
 */

/**
 * 追踪提示词使用情况
 * @param prompt 提示词内容
 */
export function trackPromptUsage(prompt: string): void {
  // 在实际应用中，可以将提示词发送到分析服务
  console.log(`[TRACKING] 记录提示词使用: "${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}"`);
} 