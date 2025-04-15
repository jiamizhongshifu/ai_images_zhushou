/**
 * 日志工具模块
 * 提供统一的日志记录功能，支持不同级别的日志输出
 */

interface LoggerInterface {
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
  trace: (message: string, ...args: any[]) => void;
}

// 日志级别
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

// 当前日志级别，可通过环境变量配置
const currentLogLevel: LogLevel = (process.env.LOG_LEVEL ? 
  parseInt(process.env.LOG_LEVEL) : 
  (process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG)) as LogLevel;

/**
 * 获取格式化的时间字符串
 */
const getFormattedTime = (): string => {
  const now = new Date();
  return now.toISOString();
};

/**
 * 日志记录器实现
 */
export const logger: LoggerInterface = {
  /**
   * 记录错误级别日志
   */
  error: (message: string, ...args: any[]) => {
    if (currentLogLevel >= LogLevel.ERROR) {
      console.error(`[${getFormattedTime()}] ERROR: ${message}`, ...args);
    }
  },
  
  /**
   * 记录警告级别日志
   */
  warn: (message: string, ...args: any[]) => {
    if (currentLogLevel >= LogLevel.WARN) {
      console.warn(`[${getFormattedTime()}] WARN: ${message}`, ...args);
    }
  },
  
  /**
   * 记录信息级别日志
   */
  info: (message: string, ...args: any[]) => {
    if (currentLogLevel >= LogLevel.INFO) {
      console.log(`[${getFormattedTime()}] INFO: ${message}`, ...args);
    }
  },
  
  /**
   * 记录调试级别日志
   */
  debug: (message: string, ...args: any[]) => {
    if (currentLogLevel >= LogLevel.DEBUG) {
      console.log(`[${getFormattedTime()}] DEBUG: ${message}`, ...args);
    }
  },
  
  /**
   * 记录跟踪级别日志
   */
  trace: (message: string, ...args: any[]) => {
    if (currentLogLevel >= LogLevel.TRACE) {
      console.log(`[${getFormattedTime()}] TRACE: ${message}`, ...args);
    }
  }
}; 