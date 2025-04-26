/**
 * 统一日志工具
 * 支持不同日志级别，避免记录Base64内容
 */

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// 当前日志级别 (可通过环境变量配置)
const currentLogLevel = process.env.LOG_LEVEL 
  ? parseInt(process.env.LOG_LEVEL, 10) 
  : (process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG);

/**
 * 为长字符串创建安全摘要，避免记录过长内容
 * @param data 需要处理的字符串
 * @param maxLength 保留的最大长度
 * @returns 安全摘要字符串
 */
export function createSafeSummary(data: any, maxLength: number = 100): string {
  if (data === null || data === undefined) return String(data);
  
  // 如果不是字符串，转换为JSON并处理
  const strData = typeof data === 'string' ? data : JSON.stringify(data);
  
  if (strData.length <= maxLength) return strData;
  
  // 检查是否是Base64图片数据
  if (strData.startsWith('data:image/') && strData.includes('base64,')) {
    const parts = strData.split(',');
    const header = parts[0];
    const base64Data = parts[1] || '';
    
    // 计算数据大小
    const sizeKB = Math.ceil((base64Data.length * 3) / 4 / 1024);
    const mimeMatch = header.match(/data:(image\/[^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'unknown';
    
    return `[${mimeType}, ${sizeKB}KB, base64前缀: ${base64Data.substring(0, 8)}...]`;
  }
  
  // 普通长字符串的处理
  return `${strData.substring(0, maxLength / 2)}...${strData.substring(strData.length - maxLength / 2)}`;
}

/**
 * 创建具有特定模块名的日志记录器
 * @param moduleName 模块名称
 * @returns 日志记录器对象
 */
export function createLogger(moduleName: string) {
  return {
    debug: (message: string, ...args: any[]) => {
      if (currentLogLevel <= LogLevel.DEBUG) {
        // 处理args以避免记录Base64
        const safeArgs = args.map(arg => 
          typeof arg === 'string' && arg.length > 1000 ? createSafeSummary(arg) : arg
        );
        console.debug(`[${moduleName}] ${message}`, ...safeArgs);
      }
    },
    
    info: (message: string, ...args: any[]) => {
      if (currentLogLevel <= LogLevel.INFO) {
        // 处理args以避免记录Base64
        const safeArgs = args.map(arg => 
          typeof arg === 'string' && arg.length > 500 ? createSafeSummary(arg) : arg
        );
        console.log(`[${moduleName}] ${message}`, ...safeArgs);
      }
    },
    
    warn: (message: string, ...args: any[]) => {
      if (currentLogLevel <= LogLevel.WARN) {
        const safeArgs = args.map(arg => 
          typeof arg === 'string' && arg.length > 1000 ? createSafeSummary(arg) : arg
        );
        console.warn(`[${moduleName}警告] ${message}`, ...safeArgs);
      }
    },
    
    error: (message: string, ...args: any[]) => {
      if (currentLogLevel <= LogLevel.ERROR) {
        const safeArgs = args.map(arg => 
          typeof arg === 'string' && arg.length > 2000 ? createSafeSummary(arg) : arg
        );
        console.error(`[${moduleName}错误] ${message}`, ...safeArgs);
      }
    },
    
    // 进度日志 - 只记录重要的里程碑进度，避免过多的进度日志
    progress: (taskId: string, progress: number, stage: string) => {
      if (currentLogLevel <= LogLevel.INFO) {
        // 只记录每10%的进度增量和阶段变化
        const isKeyProgress = 
          progress === 0 || 
          progress === 100 || 
          progress % 10 === 0 ||
          progress >= 95; // 接近完成的进度也记录
          
        if (isKeyProgress) {
          console.log(`[${moduleName}] 任务${taskId}进度: ${progress}%, 阶段: ${stage}`);
        }
      }
    },
    
    // 任务状态变化日志
    stateChange: (taskId: string, fromState: string, toState: string) => {
      if (currentLogLevel <= LogLevel.INFO) {
        console.log(`[${moduleName}状态] 任务${taskId}状态从${fromState}变更为${toState}`);
      }
    },
    
    // 计时日志 - 记录性能相关信息
    timing: (label: string, durationMs: number) => {
      if (currentLogLevel <= LogLevel.DEBUG) {
        console.log(`[${moduleName}计时] ${label}: ${durationMs}ms`);
      }
    }
  };
}

// 创建默认日志记录器
export const logger = createLogger('系统'); 