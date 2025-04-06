import React from 'react';
import { Loader2, ImageIcon, FileIcon, DatabaseIcon, InfoIcon } from 'lucide-react';

type SizeType = 'sm' | 'md' | 'lg';
type IconType = 'loader' | 'database' | 'file' | 'info';

interface BaseLoadingProps {
  message?: string;
  size?: SizeType;
  className?: string;
}

interface DataLoadingProps extends BaseLoadingProps {
  icon?: IconType;
}

interface DataEmptyProps extends BaseLoadingProps {
  description?: string;
  icon?: IconType;
}

interface ImageEmptyProps extends BaseLoadingProps {
  description?: string;
}

/**
 * 图片加载状态组件
 */
export function ImageLoading({
  message = '正在加载图片...',
  size = 'md',
  className = '',
}: BaseLoadingProps) {
  // 尺寸映射
  const sizeClasses: Record<SizeType, string> = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };
  
  const iconSizes: Record<SizeType, string> = {
    sm: 'h-5 w-5',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };
  
  const textSizes: Record<SizeType, string> = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };
  
  return (
    <div className={`flex flex-col items-center justify-center bg-card/60 rounded-xl border border-border shadow-ghibli-sm animate-pulse-soft ${sizeClasses[size]} ${className}`}>
      <Loader2 className={`${iconSizes[size]} animate-spin text-primary mb-3`} />
      <p className={`text-foreground/90 font-quicksand ${textSizes[size]}`}>{message}</p>
    </div>
  );
}

/**
 * 图片空状态组件
 */
export function ImageEmpty({
  message = '暂无图片',
  description = '上传照片并选择风格，开始创作',
  size = 'md',
  className = '',
}: ImageEmptyProps) {
  // 尺寸映射
  const sizeClasses: Record<SizeType, string> = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };
  
  const iconSizes: Record<SizeType, string> = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };
  
  const textSizes: Record<SizeType, string> = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };
  
  const descSizes: Record<SizeType, string> = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
  };
  
  return (
    <div className={`bg-card/60 rounded-xl border border-border flex flex-col items-center shadow-ghibli-sm ${sizeClasses[size]} ${className}`}>
      <div className="bg-muted/50 rounded-full p-3 mb-3">
        <ImageIcon className={`${iconSizes[size]} text-primary/60`} />
      </div>
      <p className={`text-foreground/80 mb-1.5 font-quicksand ${textSizes[size]}`}>{message}</p>
      {description && (
        <p className={`${descSizes[size]} text-muted-foreground`}>{description}</p>
      )}
    </div>
  );
}

/**
 * 数据加载状态组件
 */
export function DataLoading({
  message = '正在加载数据...',
  size = 'md',
  className = '',
  icon = 'loader',
}: DataLoadingProps) {
  // 尺寸映射
  const sizeClasses: Record<SizeType, string> = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };
  
  const iconSizes: Record<SizeType, string> = {
    sm: 'h-5 w-5',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };
  
  const textSizes: Record<SizeType, string> = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };
  
  // 图标选择
  const Icon = icon === 'database' 
    ? DatabaseIcon 
    : icon === 'file' 
      ? FileIcon 
      : Loader2;
  
  return (
    <div className={`flex flex-col items-center justify-center bg-card/60 rounded-xl border border-border shadow-ghibli-sm animate-pulse-soft ${sizeClasses[size]} ${className}`}>
      <Icon className={`${iconSizes[size]} animate-spin text-primary mb-3`} />
      <p className={`text-foreground/90 font-quicksand ${textSizes[size]}`}>{message}</p>
    </div>
  );
}

/**
 * 数据空状态组件
 */
export function DataEmpty({
  message = '暂无数据',
  description,
  icon = 'info',
  size = 'md',
  className = '',
}: DataEmptyProps) {
  // 尺寸映射
  const sizeClasses: Record<SizeType, string> = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };
  
  const iconSizes: Record<SizeType, string> = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };
  
  const textSizes: Record<SizeType, string> = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };
  
  const descSizes: Record<SizeType, string> = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
  };
  
  // 图标选择
  const Icon = icon === 'database' 
    ? DatabaseIcon 
    : icon === 'file' 
      ? FileIcon 
      : InfoIcon;
  
  return (
    <div className={`bg-card/60 rounded-xl border border-border flex flex-col items-center shadow-ghibli-sm ${sizeClasses[size]} ${className}`}>
      <div className="bg-muted/50 rounded-full p-3 mb-3">
        <Icon className={`${iconSizes[size]} text-primary/60`} />
      </div>
      <p className={`text-foreground/80 mb-1.5 font-quicksand ${textSizes[size]}`}>{message}</p>
      {description && (
        <p className={`${descSizes[size]} text-muted-foreground`}>{description}</p>
      )}
    </div>
  );
}

/**
 * 图片错误状态组件
 */
export function ImageError({
  message = '图片加载失败',
  size = 'md',
  className = '',
}: BaseLoadingProps) {
  // 尺寸映射
  const sizeClasses: Record<SizeType, string> = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };
  
  const iconSizes: Record<SizeType, string> = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };
  
  const textSizes: Record<SizeType, string> = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };
  
  return (
    <div className={`bg-card/60 rounded-xl border border-destructive/30 flex flex-col items-center shadow-ghibli-sm ${sizeClasses[size]} ${className}`}>
      <div className="bg-destructive/10 rounded-full p-3 mb-3">
        <ImageIcon className={`${iconSizes[size]} text-destructive/70`} />
      </div>
      <p className={`text-destructive/90 mb-1.5 font-quicksand ${textSizes[size]}`}>{message}</p>
    </div>
  );
} 