import React from 'react';
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface TaskProgressProps {
  percentage: number;
  stage: string;
  message: string;
  isActive: boolean;
}

/**
 * 任务进度显示组件
 * 显示任务的进度条、当前阶段和详细信息
 */
export function TaskProgressBar({ 
  percentage, 
  stage, 
  message, 
  isActive 
}: TaskProgressProps) {
  if (!isActive) return null;

  // 根据进度阶段设置颜色
  const getProgressColor = () => {
    if (stage === 'error') return 'bg-destructive';
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 50) return 'bg-blue-500';
    return 'bg-amber-500';
  };

  // 格式化阶段名称为中文
  const formatStage = (stage: string) => {
    const stageMap: Record<string, string> = {
      'queued': '排队中',
      'preparing': '准备中',
      'configuring': '配置中',
      'request_sent': '请求发送',
      'generating': '生成中',
      'processing': '处理中',
      'optimizing': '优化中',
      'finalizing': '完成处理',
      'completed': '已完成',
      'error': '出错'
    };
    
    return stageMap[stage] || stage;
  };

  return (
    <div className="w-full space-y-2 mb-4">
      {/* 进度条 */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">
          {formatStage(stage)}
        </span>
        <span className="text-sm font-medium">{percentage}%</span>
      </div>
      
      <Progress 
        value={percentage} 
        className={`h-2 ${getProgressColor()}`} 
      />
      
      {/* 进度详情 */}
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );
}

/**
 * 任务进度条占位符
 * 在加载数据时显示
 */
export function TaskProgressSkeleton() {
  return (
    <div className="w-full space-y-2 mb-4">
      <div className="flex items-center justify-between mb-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-4 w-3/4 mt-2" />
    </div>
  );
} 