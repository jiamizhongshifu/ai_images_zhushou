import { useCallback } from 'react';

export type NotificationType = 'success' | 'error' | 'info';

export interface UseNotificationResult {
  showNotification: (message: string, type?: NotificationType) => void;
}

/**
 * 自定义Hook用于显示通知消息
 */
export default function useNotification(): UseNotificationResult {
  // 显示通知的方法
  const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
    // 颜色映射
    const colorMap = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      info: 'bg-blue-500'
    };
    
    // 图标映射
    const iconMap = {
      success: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
      </svg>`,
      error: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
      </svg>`,
      info: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1-5a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd" />
      </svg>`
    };
    
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 flex items-center p-3 rounded-md shadow-lg transform transition-transform duration-500 translate-x-full ${colorMap[type]} text-white max-w-xs z-50`;
    notification.innerHTML = `
      <div class="mr-3 flex-shrink-0">
      ${iconMap[type]}
      </div>
      <div class="text-sm mr-2">${message}</div>
      <button class="ml-auto text-white">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M5.293 5.293a1 1 0 011.414 0L10 8.586l3.293-3.293a1 1 0 111.414 1.414L11.414 10l3.293 3.293a1 1 0 01-1.414 1.414L10 11.414l-3.293 3.293a1 1 0 01-1.414-1.414L8.586 10 5.293 6.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    `;

    // 添加到文档
    document.body.appendChild(notification);
    
    // 添加关闭按钮功能
    const closeButton = notification.querySelector('button');
    closeButton?.addEventListener('click', () => {
      notification.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => {
        notification.remove();
      }, 300);
    });
    
    // 显示通知（在下一帧添加过渡动画）
    setTimeout(() => {
      notification.classList.remove('translate-x-full');
    }, 10);
    
    // 自动关闭
    setTimeout(() => {
      notification.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }, []);

  return { showNotification };
} 