import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale/zh-CN';
import { getAllPendingTasks } from '@/utils/taskStorage';
import { PendingTask, TaskStatus } from '@/types/task';

interface TaskRecoveryDialogProps {
  onRecover: (task: PendingTask) => void;
  onDiscard: (taskId: string) => void;
}

/**
 * 任务恢复对话框组件
 * 用于在页面加载时检测到未完成的任务时显示
 */
export default function TaskRecoveryDialog({ onRecover, onDiscard }: TaskRecoveryDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);

  // 在组件挂载时检查是否有未完成的任务
  useEffect(() => {
    try {
      const pendingTasks = getAllPendingTasks();
      
      // 只处理最近的一个任务
      if (pendingTasks.length > 0) {
        // 过滤出状态为 pending 或 processing 的任务
        const activeTasks = pendingTasks.filter(
          task => task.status === TaskStatus.PENDING || task.status === TaskStatus.PROCESSING
        );
        
        if (activeTasks.length > 0) {
          // 找出时间最近的任务
          const latestTask = activeTasks.sort((a, b) => b.timestamp - a.timestamp)[0];
          
          // 显示对话框
          setPendingTask(latestTask);
          setIsOpen(true);
          
          console.log('[任务恢复] 检测到未完成任务:', latestTask.taskId);
        }
      }
    } catch (error) {
      console.error('[任务恢复] 检查本地任务失败:', error);
    }
  }, []);

  // 处理恢复任务
  const handleRecover = () => {
    if (pendingTask) {
      onRecover(pendingTask);
      setIsOpen(false);
    }
  };

  // 处理丢弃任务
  const handleDiscard = () => {
    if (pendingTask) {
      onDiscard(pendingTask.taskId);
      setIsOpen(false);
    }
  };

  // 如果没有待处理任务，不显示对话框
  if (!pendingTask) {
    return null;
  }

  // 格式化时间
  const formattedTime = formatDistanceToNow(new Date(pendingTask.timestamp), {
    addSuffix: true,
    locale: zhCN
  });

  // 格式化提示词，截取前30个字符
  const promptText = pendingTask.params?.prompt || '未知提示词';
  const shortPrompt = promptText.length > 30 
    ? promptText.substring(0, 30) + '...' 
    : promptText;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>检测到未完成的图片生成任务</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            {formattedTime}创建的任务尚未完成，是否要继续处理？
          </p>
          
          <div className="bg-muted p-3 rounded-md">
            <p className="text-sm font-medium">提示词:</p>
            <p className="text-sm">{shortPrompt}</p>
            
            {pendingTask.params?.style && (
              <>
                <p className="text-sm font-medium mt-2">风格:</p>
                <p className="text-sm">{pendingTask.params.style}</p>
              </>
            )}
          </div>
        </div>
        
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button 
            variant="outline" 
            onClick={handleDiscard}
            className="sm:w-1/3"
          >
            放弃任务
          </Button>
          <Button 
            onClick={handleRecover}
            className="sm:w-2/3"
          >
            继续处理
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 