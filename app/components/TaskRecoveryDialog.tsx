"use client";

import { useState, useEffect } from 'react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, RefreshCw, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getAllPendingTasks } from '@/utils/taskStorage';
import { PendingTask } from '@/types/task';

interface TaskRecoveryDialogProps {
  onRecover: (task: PendingTask) => void;
  onDiscard: (taskId: string) => void;
}

export default function TaskRecoveryDialog({ 
  onRecover, 
  onDiscard 
}: TaskRecoveryDialogProps) {
  const [open, setOpen] = useState(false);
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);
  
  useEffect(() => {
    // 页面加载时检查本地存储中的未完成任务
    const checkPendingTasks = () => {
      try {
        const storedTasks = localStorage.getItem('pendingImageTasks');
        if (!storedTasks) return;
        
        const tasks: PendingTask[] = JSON.parse(storedTasks);
        if (!tasks || tasks.length === 0) return;
        
        // 查找最近的任务
        const latestTask = tasks.sort((a, b) => b.timestamp - a.timestamp)[0];
        
        // 检查任务是否不太旧（24小时内）
        if (Date.now() - latestTask.timestamp < 24 * 60 * 60 * 1000) {
          setPendingTask(latestTask);
          setOpen(true);
        }
      } catch (error) {
        console.error('检查未完成任务出错:', error);
      }
    };
    
    // 延迟执行，确保页面已完全加载
    const timer = setTimeout(checkPendingTasks, 1000);
    return () => clearTimeout(timer);
  }, []);
  
  if (!pendingTask) return null;
  
  // 格式化时间显示
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });
  };
  
  // 获取时间经过描述
  const getTimeElapsed = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds}秒前`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
    return `${Math.floor(seconds / 86400)}天前`;
  };
  
  const handleRecover = () => {
    setOpen(false);
    onRecover(pendingTask);
  };
  
  const handleDiscard = () => {
    setOpen(false);
    onDiscard(pendingTask.taskId);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Clock className="w-5 h-5 mr-2 text-primary" />
            检测到未完成的任务
          </DialogTitle>
          <DialogDescription>
            发现一个未完成的图片生成任务，创建于{getTimeElapsed(pendingTask.timestamp)}。
            您可以继续处理该任务或者放弃此任务。
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="border rounded-md p-4 bg-muted/20">
            <div className="flex flex-col space-y-2">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">任务ID:</span> {pendingTask.taskId}
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">创建时间:</span> {formatTime(pendingTask.timestamp)}
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">风格:</span> {pendingTask.params?.style || '未指定'}
              </div>
              <div className="text-sm text-muted-foreground line-clamp-2">
                <span className="font-medium text-foreground">提示词:</span> {pendingTask.params?.prompt || '未指定'}
              </div>
            </div>
          </div>
          
          <div className="flex items-center bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
            <AlertCircle className="w-5 h-5 mr-2 text-amber-500" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              继续处理可能需要一些时间，具体取决于后台服务状态
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={handleDiscard}
            className="border-destructive/30 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
          >
            放弃任务
          </Button>
          <Button 
            onClick={handleRecover}
            className="bg-primary hover:bg-primary/90"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            继续处理
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 