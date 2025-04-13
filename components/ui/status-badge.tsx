import React from 'react';
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertCircle, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export type TaskStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'recovering'
  | 'unknown';

interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export default function StatusBadge({
  status,
  className,
  showIcon = true,
  size = 'md',
  animated = true
}: StatusBadgeProps) {
  // 状态配置
  const statusConfig: Record<
    TaskStatus, 
    { label: string; variant: string; icon: React.ReactNode; animationClass?: string }
  > = {
    'pending': { 
      label: '等待处理', 
      variant: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800', 
      icon: <Clock className="h-3.5 w-3.5" />,
      animationClass: animated ? 'animate-pulse' : ''
    },
    'processing': { 
      label: '处理中', 
      variant: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800', 
      icon: <Loader2 className="h-3.5 w-3.5" />,
      animationClass: animated ? 'animate-spin' : ''
    },
    'completed': { 
      label: '已完成', 
      variant: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800', 
      icon: <CheckCircle2 className="h-3.5 w-3.5" />
    },
    'failed': { 
      label: '失败', 
      variant: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800', 
      icon: <XCircle className="h-3.5 w-3.5" />
    },
    'cancelled': { 
      label: '已取消', 
      variant: 'bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700', 
      icon: <XCircle className="h-3.5 w-3.5" />
    },
    'recovering': { 
      label: '恢复中', 
      variant: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800', 
      icon: <Loader2 className="h-3.5 w-3.5" />,
      animationClass: animated ? 'animate-spin' : ''
    },
    'unknown': { 
      label: '未知状态', 
      variant: 'bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700', 
      icon: <AlertCircle className="h-3.5 w-3.5" />
    }
  };

  const config = statusConfig[status] || statusConfig.unknown;
  
  // 尺寸类
  const sizeClasses = {
    'sm': 'text-xs py-0.5 px-1.5',
    'md': 'text-xs py-1 px-2',
    'lg': 'text-sm py-1 px-2.5'
  };

  return (
    <Badge 
      variant="outline"
      className={cn(
        'font-medium border',
        config.variant,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && (
        <span className={cn('mr-1 flex-shrink-0', config.animationClass)}>
          {config.icon}
        </span>
      )}
      {config.label}
    </Badge>
  );
} 