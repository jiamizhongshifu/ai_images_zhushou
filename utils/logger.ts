/**
 * 日志工具模块 - 提供统一的日志记录接口
 */

// 日志级别
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 环境检查
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// 日志前缀颜色（仅在开发环境控制台中有效）
const LOG_COLORS = {
  debug: '\x1b[36m', // 青色
  info: '\x1b[32m',  // 绿色
  warn: '\x1b[33m',  // 黄色
  error: '\x1b[31m', // 红色
  reset: '\x1b[0m'   // 重置
};

/**
 * 格式化日志消息
 */
const formatMessage = (level: LogLevel, message: string, module?: string): string => {
  const timestamp = new Date().toISOString();
  const modulePrefix = module ? `[${module}] ` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${modulePrefix}${message}`;
};

/**
 * 控制台日志输出
 */
const consoleLog = (level: LogLevel, message: string, ...args: any[]) => {
  // 在生产环境中，忽略debug级别的日志
  if (isProduction && level === 'debug') return;

  const color = isDevelopment ? LOG_COLORS[level] : '';
  const reset = isDevelopment ? LOG_COLORS.reset : '';
  
  switch (level) {
    case 'debug':
      console.debug(`${color}${message}${reset}`, ...args);
      break;
    case 'info':
      console.info(`${color}${message}${reset}`, ...args);
      break;
    case 'warn':
      console.warn(`${color}${message}${reset}`, ...args);
      break;
    case 'error':
      console.error(`${color}${message}${reset}`, ...args);
      break;
  }
};

/**
 * 创建日志记录器
 */
export const getLogger = (module?: string) => {
  return {
    debug: (message: string, ...args: any[]) => {
      consoleLog('debug', formatMessage('debug', message, module), ...args);
    },
    info: (message: string, ...args: any[]) => {
      consoleLog('info', formatMessage('info', message, module), ...args);
    },
    warn: (message: string, ...args: any[]) => {
      consoleLog('warn', formatMessage('warn', message, module), ...args);
    },
    error: (message: string, ...args: any[]) => {
      consoleLog('error', formatMessage('error', message, module), ...args);
    }
  };
};

// 默认日志记录器
const logger = {
  debug: (message: string, ...args: any[]) => {
    consoleLog('debug', formatMessage('debug', message), ...args);
  },
  info: (message: string, ...args: any[]) => {
    consoleLog('info', formatMessage('info', message), ...args);
  },
  warn: (message: string, ...args: any[]) => {
    consoleLog('warn', formatMessage('warn', message), ...args);
  },
  error: (message: string, ...args: any[]) => {
    consoleLog('error', formatMessage('error', message), ...args);
  }
};

export default logger; 