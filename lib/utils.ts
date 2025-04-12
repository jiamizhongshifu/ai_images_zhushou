import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 防抖函数 - 延迟执行函数直到停止调用一段时间后
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>): void => {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
  };
}

// 节流函数 - 限制函数调用频率
export function throttle<T extends (...args: any[]) => Promise<any>>(
  func: T, 
  delay: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let lastCall = 0;
  let timeout: NodeJS.Timeout | null = null;
  let pendingPromise: Promise<ReturnType<T>> | null = null;
  
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    // 如果已经有一个挂起的Promise，返回它
    if (pendingPromise) {
      return pendingPromise;
    }
    
    if (timeSinceLastCall >= delay) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastCall = now;
      try {
        pendingPromise = func(...args) as Promise<ReturnType<T>>;
        const result = await pendingPromise;
        return result;
      } finally {
        pendingPromise = null;
      }
    } else {
      // 如果在冷却期间且没有待处理的调用，则安排一个
      return new Promise((resolve, reject) => {
        timeout = setTimeout(async () => {
          lastCall = Date.now();
          timeout = null;
          try {
            pendingPromise = func(...args) as Promise<ReturnType<T>>;
            const result = await pendingPromise;
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            pendingPromise = null;
          }
        }, delay - timeSinceLastCall);
      });
    }
  };
}
