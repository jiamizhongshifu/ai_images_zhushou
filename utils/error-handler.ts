/**
 * 统一处理错误，并发送到监控系统
 * 提供一致的错误记录和处理机制
 */

// 错误类型定义
type ErrorInfo = {
  message: string;
  stack?: string;
  context: string;
  extraData?: any;
  timestamp: string;
  code?: string;
};

// 错误级别枚举
export enum ErrorLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * 统一处理错误并记录日志
 * @param error 错误对象
 * @param context 错误发生的上下文
 * @param extraData 额外信息
 * @param level 错误级别
 * @returns 格式化的错误信息
 */
export function handleError(
  error: any, 
  context: string, 
  extraData?: any, 
  level: ErrorLevel = ErrorLevel.ERROR
): ErrorInfo {
  // 1. 格式化错误信息
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  const errorCode = (error as any)?.code || 'UNKNOWN_ERROR';
  
  // 构建错误信息对象
  const errorInfo: ErrorInfo = {
    message: errorMessage,
    stack: errorStack,
    context,
    extraData,
    timestamp: new Date().toISOString(),
    code: errorCode
  };
  
  // 2. 根据错误级别记录到控制台
  switch (level) {
    case ErrorLevel.INFO:
      console.info(`[${context}] 信息:`, errorInfo);
      break;
    case ErrorLevel.WARNING:
      console.warn(`[${context}] 警告:`, errorInfo);
      break;
    case ErrorLevel.ERROR:
      console.error(`[${context}] 错误:`, errorInfo);
      break;
    case ErrorLevel.FATAL:
      console.error(`[${context}] 致命错误:`, errorInfo);
      break;
  }
  
  // 3. 实际项目中，可以在这里添加接入错误监控系统的代码
  // if (process.env.NODE_ENV === 'production') {
  //   // 例如发送到Sentry或其他错误监控服务
  //   Sentry.captureException(error, {
  //     tags: { context, level },
  //     extra: { ...extraData, timestamp: errorInfo.timestamp }
  //   });
  //
  //   // 或者记录到日志系统
  //   Logger.log({
  //     level,
  //     message: errorMessage,
  //     context,
  //     ...extraData
  //   });
  // }
  
  // 4. 返回标准化的错误信息
  return errorInfo;
}

/**
 * 将错误信息转换为API响应格式
 * @param errorInfo 错误信息
 * @param includeDebugInfo 是否包含调试信息
 * @returns API响应格式的错误对象
 */
export function formatErrorResponse(errorInfo: ErrorInfo, includeDebugInfo = false): any {
  const response = {
    success: false,
    error: errorInfo.message,
    context: errorInfo.context,
    timestamp: errorInfo.timestamp,
    code: errorInfo.code
  };
  
  // 在开发环境或明确要求时，包含调试信息
  if (includeDebugInfo || process.env.NODE_ENV !== 'production') {
    return {
      ...response,
      debug: {
        stack: errorInfo.stack,
        extraData: errorInfo.extraData
      }
    };
  }
  
  return response;
}

/**
 * 尝试执行函数并处理可能的错误
 * @param fn 要执行的异步函数
 * @param context 执行上下文
 * @param fallback 发生错误时的返回值
 * @returns 函数执行结果或fallback值
 */
export async function tryCatch<T>(
  fn: () => Promise<T>, 
  context: string, 
  fallback?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    handleError(error, context);
    return fallback;
  }
}

/**
 * 确保操作是幂等的辅助函数
 * @param key 幂等操作的唯一键
 * @param fn 要执行的函数
 * @param context 执行上下文
 * @returns 函数执行结果
 */
const processedKeys = new Set<string>();
export async function ensureIdempotent<T>(
  key: string, 
  fn: () => Promise<T>, 
  context: string
): Promise<T | null> {
  // 如果已经处理过此key，则跳过
  if (processedKeys.has(key)) {
    handleError(
      `操作已执行过，key: ${key}`, 
      context, 
      { key }, 
      ErrorLevel.INFO
    );
    return null;
  }
  
  try {
    // 先标记为已处理，确保即使出错也不会重试
    processedKeys.add(key);
    return await fn();
  } catch (error) {
    handleError(error, `${context}:ensureIdempotent`);
    throw error;
  }
} 