"use client"

// 基于enhanced-toast.tsx封装的方便使用的Hook
import { useState, useEffect, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
  id: string;
  title: string | ReactNode;
  description?: string | ReactNode;
  type: ToastType;
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  // 清除特定toast
  const dismiss = useCallback((id: string) => {
    setToasts((toasts) => toasts.filter((toast) => toast.id !== id));
  }, []);

  // 自动清除toast
  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];
    
    toasts.forEach((toast) => {
      if (toast.duration !== Infinity) {
        const timeout = setTimeout(() => {
          dismiss(toast.id);
        }, toast.duration || 5000);
        
        timeouts.push(timeout);
      }
    });
    
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
    };
  }, [toasts, dismiss]);

  // 创建toast的主函数
  const toast = useCallback(
    (props: Omit<ToastProps, 'id'>) => {
      const id = uuidv4();
      const newToast: ToastProps = {
        id,
        ...props,
        duration: props.duration ?? 5000,
      };
      
      setToasts((toasts) => [...toasts, newToast]);
      
      return {
        id,
        dismiss: () => dismiss(id),
      };
    },
    [dismiss]
  );

  // 快捷方法
  const success = useCallback(
    (props: Omit<ToastProps, 'id' | 'type'>) => toast({ ...props, type: 'success' }),
    [toast]
  );
  
  const error = useCallback(
    (props: Omit<ToastProps, 'id' | 'type'>) => toast({ ...props, type: 'error' }),
    [toast]
  );
  
  const warning = useCallback(
    (props: Omit<ToastProps, 'id' | 'type'>) => toast({ ...props, type: 'warning' }),
    [toast]
  );
  
  const info = useCallback(
    (props: Omit<ToastProps, 'id' | 'type'>) => toast({ ...props, type: 'info' }),
    [toast]
  );

  return {
    toast,
    success,
    error,
    warning,
    info,
    dismiss,
    toasts,
  };
}

export default useToast; 