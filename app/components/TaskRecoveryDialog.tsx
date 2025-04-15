"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { getAllPendingTasks, clearPendingTask, isTaskExpired } from '@/utils/taskStorage';
import { PendingTask, TaskStatus } from '@/types/task';
import { recoverTask, retryTask } from '@/utils/taskPoller';
import { toast } from 'react-hot-toast';
import { Loader2, AlertTriangle, Trash, RefreshCw } from 'lucide-react';

export interface TaskRecoveryDialogProps {
  onRecover: (taskId: string) => void;
  onDiscard: () => void;
}

/**
 * 任务恢复对话框组件
 * 自动检测浏览器本地存储中的待处理任务，并提供恢复或丢弃选项
 */
export default function TaskRecoveryDialog({ onRecover, onDiscard }: TaskRecoveryDialogProps) {
  const [open, setOpen] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<PendingTask | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // 检查本地存储中的未完成任务
  useEffect(() => {
    try {
      // 获取所有待处理任务
      const tasks = getAllPendingTasks();
      
      if (tasks.length > 0) {
        console.log(`[任务恢复] 发现 ${tasks.length} 个待处理任务`);
        
        // 过滤出未完成且未过期的任务
        const incompleteTasks = tasks.filter(task => {
          // 处理中的任务或失败的任务（可恢复）
          const isIncomplete = [
            TaskStatus.PENDING, 
            TaskStatus.PROCESSING, 
            TaskStatus.FAILED
          ].includes(task.status);
          
          // 检查是否过期
          const expired = isTaskExpired(task);
          
          if (expired && isIncomplete) {
            console.log(`[任务恢复] 任务 ${task.taskId} 已过期，将被忽略`);
          }
          
          return isIncomplete && !expired;
        });
        
        if (incompleteTasks.length > 0) {
          // 按时间戳排序，选择最近的任务
          incompleteTasks.sort((a, b) => b.timestamp - a.timestamp);
          setPendingTasks(incompleteTasks);
          setSelectedTask(incompleteTasks[0]);
          setOpen(true);
        } else {
          console.log('[任务恢复] 未发现有效的待处理任务');
          // 自动清理过期任务
          tasks.forEach(task => {
            if (isTaskExpired(task)) {
              clearPendingTask(task.taskId);
            }
          });
        }
      }
    } catch (error) {
      console.error('[任务恢复] 检查待处理任务时出错:', error);
    }
  }, []);

  // 恢复任务
  const handleRecover = async () => {
    if (!selectedTask) return;
    
    setIsRecovering(true);
    
    try {
      console.log(`[任务恢复] 正在恢复任务: ${selectedTask.taskId}`);
      
      // 尝试恢复任务（与服务器状态同步）
      const success = await recoverTask(selectedTask.taskId, true);
      
      if (success) {
        console.log(`[任务恢复] 任务恢复成功: ${selectedTask.taskId}`);
        toast.success('正在恢复之前的任务');
        onRecover(selectedTask.taskId);
        setOpen(false);
      } else {
        console.error(`[任务恢复] 任务恢复失败: ${selectedTask.taskId}`);
        toast.error('无法恢复之前的任务，请尝试重新创建');
      }
    } catch (error) {
      console.error('[任务恢复] 恢复任务时出错:', error);
      toast.error('恢复任务时出错，请尝试重新创建');
    } finally {
      setIsRecovering(false);
    }
  };

  // 重试任务
  const handleRetry = async () => {
    if (!selectedTask) return;
    
    setIsRetrying(true);
    
    try {
      console.log(`[任务恢复] 正在重试任务: ${selectedTask.taskId}`);
      
      // 创建新任务
      const newTaskId = await retryTask(selectedTask.taskId);
      
      if (newTaskId) {
        console.log(`[任务恢复] 任务重试成功，新任务ID: ${newTaskId}`);
        toast.success('正在重新创建任务');
        onRecover(newTaskId);
        setOpen(false);
      } else {
        console.error(`[任务恢复] 任务重试失败`);
        toast.error('无法重新创建任务，请手动创建');
      }
    } catch (error) {
      console.error('[任务恢复] 重试任务时出错:', error);
      toast.error('重试任务时出错，请手动创建');
    } finally {
      setIsRetrying(false);
    }
  };

  // 丢弃任务
  const handleDiscard = () => {
    if (selectedTask) {
      console.log(`[任务恢复] 丢弃任务: ${selectedTask.taskId}`);
      clearPendingTask(selectedTask.taskId);
    }
    
    // 检查是否还有其他待处理任务
    if (pendingTasks.length > 1) {
      const remainingTasks = pendingTasks.filter(task => 
        task.taskId !== selectedTask?.taskId
      );
      setPendingTasks(remainingTasks);
      setSelectedTask(remainingTasks[0]);
    } else {
      setOpen(false);
      onDiscard();
    }
  };

  // 获取任务状态显示文本
  const getStatusText = (status: TaskStatus): string => {
    switch (status) {
      case TaskStatus.PENDING:
        return '等待处理';
      case TaskStatus.PROCESSING:
        return '处理中';
      case TaskStatus.FAILED:
        return '处理失败';
      default:
        return '未知状态';
    }
  };

  // 获取任务创建时间的友好显示
  const getTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds}秒前`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
    return `${Math.floor(seconds / 86400)}天前`;
  };

  // 如果没有未完成任务，不显示对话框
  if (pendingTasks.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
            发现未完成的任务
          </DialogTitle>
          <DialogDescription>
            我们检测到您之前的图像生成任务尚未完成，您可以选择恢复处理或丢弃它。
          </DialogDescription>
        </DialogHeader>
        
        {selectedTask && (
          <div className="py-4 space-y-4">
            <div className="border rounded-md p-4 bg-muted/30">
              <div className="text-sm text-muted-foreground">
                <p><span className="font-semibold">提示词:</span> {selectedTask.params.prompt?.substring(0, 70)}...</p>
                <p><span className="font-semibold">状态:</span> {getStatusText(selectedTask.status)}</p>
                <p><span className="font-semibold">创建时间:</span> {getTimeAgo(selectedTask.timestamp)}</p>
                {selectedTask.errorMessage && (
                  <p><span className="font-semibold">错误:</span> <span className="text-destructive">{selectedTask.errorMessage}</span></p>
                )}
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground">
              {selectedTask.status === TaskStatus.PROCESSING && (
                <p>任务可能仍在处理中，您可以尝试恢复查看其状态。</p>
              )}
              {selectedTask.status === TaskStatus.FAILED && (
                <p>任务处理失败，您可以尝试重新创建相同的图像生成任务。</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button 
            variant="secondary" 
            onClick={handleDiscard} 
            className="flex items-center"
            disabled={isRecovering || isRetrying}
          >
            <Trash className="h-4 w-4 mr-1" />
            丢弃
          </Button>
          
          <div className="flex gap-2">
            {selectedTask?.status === TaskStatus.FAILED && (
              <Button 
                onClick={handleRetry} 
                className="flex items-center" 
                disabled={isRecovering || isRetrying}
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    重新创建中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    重新创建
                  </>
                )}
              </Button>
            )}
            
            <Button 
              onClick={handleRecover} 
              className="flex items-center" 
              disabled={isRecovering || isRetrying}
            >
              {isRecovering ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  恢复中...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  恢复任务
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 