"use client"

import React from 'react';
import { 
  Check, X, AlertCircle, Info, 
  Loader2, Camera, Download, ImageIcon 
} from 'lucide-react';
import { 
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";

/**
 * 增强型通知组件API
 * 提供更丰富的通知类型和交互体验
 */
export const useEnhancedToast = () => {
  const { toast, dismiss: dismissToast } = useToast();
  
  // 成功通知
  const success = (title: string, description?: string) => {
    return toast({
      variant: "default",
      className: "bg-gradient-to-r from-green-500/10 to-green-600/5 border-green-500/30",
      type: "success",
      title: (
        <div className="flex items-center">
          <span className="flex items-center justify-center bg-green-500/20 p-1 rounded-full mr-2">
            <Check className="h-4 w-4 text-green-600" />
          </span>
          <span>{title}</span>
        </div>
      ),
      description: description ? (
        <div className="ml-7">{description}</div>
      ) : undefined,
    });
  };
  
  // 错误通知
  const error = (title: string, description?: string) => {
    return toast({
      variant: "destructive",
      type: "error",
      title: (
        <div className="flex items-center">
          <span className="flex items-center justify-center bg-destructive/20 p-1 rounded-full mr-2">
            <X className="h-4 w-4 text-destructive" />
          </span>
          <span>{title}</span>
        </div>
      ),
      description: description ? (
        <div className="ml-7">{description}</div>
      ) : undefined,
    });
  };
  
  // 警告通知
  const warning = (title: string, description?: string) => {
    return toast({
      variant: "default",
      className: "bg-gradient-to-r from-amber-500/10 to-amber-600/5 border-amber-500/30",
      type: "warning",
      title: (
        <div className="flex items-center">
          <span className="flex items-center justify-center bg-amber-500/20 p-1 rounded-full mr-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </span>
          <span>{title}</span>
        </div>
      ),
      description: description ? (
        <div className="ml-7">{description}</div>
      ) : undefined,
    });
  };
  
  // 信息通知
  const info = (title: string, description?: string) => {
    return toast({
      variant: "default",
      className: "bg-gradient-to-r from-blue-500/10 to-blue-600/5 border-blue-500/30",
      type: "info",
      title: (
        <div className="flex items-center">
          <span className="flex items-center justify-center bg-blue-500/20 p-1 rounded-full mr-2">
            <Info className="h-4 w-4 text-blue-600" />
          </span>
          <span>{title}</span>
        </div>
      ),
      description: description ? (
        <div className="ml-7">{description}</div>
      ) : undefined,
    });
  };
  
  // 加载通知 - 用于长时间操作
  const loading = (title: string, description?: string) => {
    return toast({
      variant: "default",
      duration: Infinity, // 不会自动关闭
      className: "bg-gradient-to-r from-primary/10 to-primary-600/5 border-primary/30",
      type: "info",
      title: (
        <div className="flex items-center">
          <span className="flex items-center justify-center bg-primary/20 p-1 rounded-full mr-2">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          </span>
          <span>{title}</span>
        </div>
      ),
      description: description ? (
        <div className="ml-7">{description}</div>
      ) : undefined,
    });
  };
  
  // 图片相关通知
  const imageUploaded = (title: string = "图片已上传") => {
    return toast({
      variant: "default",
      className: "bg-gradient-to-r from-primary/10 to-primary-600/5 border-primary/30",
      type: "success",
      title: (
        <div className="flex items-center">
          <span className="flex items-center justify-center bg-primary/20 p-1 rounded-full mr-2">
            <Camera className="h-4 w-4 text-primary" />
          </span>
          <span>{title}</span>
        </div>
      ),
    });
  };
  
  const imageDownloaded = (title: string = "图片已下载") => {
    return toast({
      variant: "default",
      className: "bg-gradient-to-r from-primary/10 to-primary-600/5 border-primary/30",
      type: "success",
      title: (
        <div className="flex items-center">
          <span className="flex items-center justify-center bg-primary/20 p-1 rounded-full mr-2">
            <Download className="h-4 w-4 text-primary" />
          </span>
          <span>{title}</span>
        </div>
      ),
    });
  };
  
  const imageError = (title: string = "图片加载失败") => {
    return toast({
      variant: "destructive",
      type: "error",
      title: (
        <div className="flex items-center">
          <span className="flex items-center justify-center bg-destructive/20 p-1 rounded-full mr-2">
            <ImageIcon className="h-4 w-4 text-destructive" />
          </span>
          <span>{title}</span>
        </div>
      ),
    });
  };
  
  // 更新已有通知
  const update = (id: string, props: any) => {
    return toast({
      ...props,
      id,
      type: props.type || "info",
    });
  };
  
  // 关闭特定通知
  const dismiss = (id?: string) => {
    // 确保只传递有效的字符串ID
    if (id) {
      return dismissToast(id);
    }
    // 如果没有ID，关闭所有通知
    return { id: '', dismiss: () => {} };
  };
  
  return {
    success,
    error,
    warning,
    info,
    loading,
    imageUploaded,
    imageDownloaded,
    imageError,
    update,
    dismiss,
    toast, // 原始toast函数
  };
};

/**
 * 增强型Toast渲染组件 - 美化过的通知显示组件
 */
export function EnhancedToast({ ...props }) {
  return (
    <Toast 
      className="group shadow-ghibli border border-border backdrop-blur-sm data-[state=open]:animate-float-in data-[state=closed]:animate-fade-out data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-[transform_200ms_ease-out] data-[swipe=end]:animate-fade-out"
      {...props}
    />
  );
}

export { ToastProvider, ToastViewport, ToastClose, ToastTitle, ToastDescription }; 