/**
 * 支付操作重试中间件
 * 在支付相关操作失败时自动重试，提高成功率
 */

/**
 * 指数退避重试函数
 * @param operation 要重试的操作函数
 * @param options 重试选项
 * @returns 操作结果或抛出最终错误
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (error: unknown, retryCount: number, delay: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 300,
    maxDelay = 3000,
    factor = 2,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;
  
  let retryCount = 0;
  let delay = initialDelay;
  
  while (true) {
    try {
      return await operation();
    } catch (error) {
      retryCount++;
      
      if (retryCount > maxRetries || !shouldRetry(error)) {
        throw error;
      }
      
      // 计算下一次延迟（指数退避）
      delay = Math.min(delay * factor, maxDelay);
      
      // 执行重试回调
      onRetry(error, retryCount, delay);
      
      // 等待指定时间后重试
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * 支付操作重试装饰器
 * @param operation 支付操作函数
 * @param options 重试配置
 * @returns 包装后的函数
 */
export function withPaymentRetry<T, Args extends any[]>(
  operation: (...args: Args) => Promise<T>,
  options: {
    maxRetries?: number;
    logPrefix?: string;
    onRetry?: (error: unknown, retryCount: number, delay: number) => void;
  } = {}
): (...args: Args) => Promise<T> {
  const {
    maxRetries = 3,
    logPrefix = '支付操作',
    onRetry
  } = options;
  
  return async (...args: Args) => {
    return withRetry(
      () => operation(...args),
      {
        maxRetries,
        shouldRetry: (error) => {
          // 过滤不应重试的错误
          if (error instanceof Error) {
            const errorMessage = error.message.toLowerCase();
            // 不重试明确的业务错误
            if (
              errorMessage.includes('订单已处理') ||
              errorMessage.includes('订单不存在') ||
              errorMessage.includes('无效的订单')
            ) {
              return false;
            }
          }
          return true;
        },
        onRetry: (error, retryCount, delay) => {
          console.warn(
            `${logPrefix}失败，进行第${retryCount}次重试，延迟${delay}ms，错误:`,
            error instanceof Error ? error.message : String(error)
          );
          
          if (onRetry) {
            onRetry(error, retryCount, delay);
          }
        }
      }
    );
  };
}

/**
 * 批量处理支付订单
 * @param orderNos 订单号列表
 * @param processFn 处理单个订单的函数
 * @param options 批处理选项
 * @returns 处理结果
 */
export async function processBatchOrders<T>(
  orderNos: string[],
  processFn: (orderNo: string) => Promise<T>,
  options: {
    concurrency?: number;
    stopOnError?: boolean;
    onProgress?: (
      orderNo: string,
      result: { success: boolean; data?: T; error?: Error },
      completed: number,
      total: number
    ) => void;
  } = {}
): Promise<{
  results: Array<{ orderNo: string; success: boolean; data?: T; error?: Error }>;
  successful: number;
  failed: number;
  total: number;
}> {
  const {
    concurrency = 2,
    stopOnError = false,
    onProgress
  } = options;
  
  const results: Array<{ orderNo: string; success: boolean; data?: T; error?: Error }> = [];
  let successful = 0;
  let failed = 0;
  
  // 实现批量处理逻辑
  const queue = [...orderNos];
  const total = queue.length;
  
  // 并发处理函数
  const processQueue = async (): Promise<void> => {
    if (queue.length === 0) return;
    
    const orderNo = queue.shift()!;
    
    try {
      // 处理单个订单（含重试机制）
      const retryProcessFn = withPaymentRetry(processFn, {
        logPrefix: `订单${orderNo}处理`
      });
      
      const data = await retryProcessFn(orderNo);
      
      results.push({ orderNo, success: true, data });
      successful++;
      
      if (onProgress) {
        onProgress(orderNo, { success: true, data }, successful + failed, total);
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      results.push({ orderNo, success: false, error: errorObj });
      failed++;
      
      if (onProgress) {
        onProgress(orderNo, { success: false, error: errorObj }, successful + failed, total);
      }
      
      if (stopOnError) {
        // 如果遇到错误需要停止，将剩余订单标记为跳过
        queue.forEach(remainingOrderNo => {
          results.push({
            orderNo: remainingOrderNo,
            success: false,
            error: new Error('已跳过处理')
          });
        });
        
        queue.length = 0; // 清空队列
        return;
      }
    }
    
    // 继续处理队列中的下一个
    return processQueue();
  };
  
  // 启动并发处理
  const workers = Array(Math.min(concurrency, orderNos.length))
    .fill(0)
    .map(() => processQueue());
  
  await Promise.all(workers);
  
  return {
    results,
    successful,
    failed,
    total
  };
} 