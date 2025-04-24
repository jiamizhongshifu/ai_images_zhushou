"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PendingTask, removePendingTask } from '@/utils/taskRecovery';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export interface TaskRecoveryDialogProps {
  task: PendingTask;
  onRecover: (task: PendingTask) => Promise<void>;
  onDiscard: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function TaskRecoveryDialog({
  task,
  onRecover,
  onDiscard,
  open,
  setOpen,
}: TaskRecoveryDialogProps) {
  const [isRecovering, setIsRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecover = async () => {
    setIsRecovering(true);
    setError(null);
    try {
      await onRecover(task);
      // 成功后关闭对话框
      setOpen(false);
    } catch (err) {
      setError('恢复任务失败，请重试。');
      console.error('任务恢复失败:', err);
    } finally {
      setIsRecovering(false);
    }
  };

  const handleDiscard = () => {
    removePendingTask(task.id);
    onDiscard();
    setOpen(false);
  };

  const formattedTime = task.timestamp
    ? format(new Date(task.timestamp), 'yyyy年MM月dd日 HH:mm:ss', { locale: zhCN })
    : '未知时间';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>发现未完成的任务</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p>我们检测到您有一个未完成的图像生成任务：</p>
          
          <div className="rounded-md bg-muted p-4 space-y-2 text-sm">
            <div>
              <span className="font-medium">提示词：</span> {task.prompt}
            </div>
            <div>
              <span className="font-medium">风格：</span> {task.style}
            </div>
            {task.uploadedImage && (
              <div>
                <span className="font-medium">已上传参考图片</span>
              </div>
            )}
            <div>
              <span className="font-medium">创建时间：</span> {formattedTime}
            </div>
            <div>
              <span className="font-medium">尝试次数：</span> {task.attemptCount || 1}
            </div>
          </div>
          
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-destructive text-sm">
              {error}
            </div>
          )}
          
          <p>您希望如何处理这个任务？</p>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button 
            variant="outline" 
            onClick={handleDiscard}
            disabled={isRecovering}
          >
            丢弃任务
          </Button>
          <Button 
            onClick={handleRecover}
            disabled={isRecovering}
          >
            {isRecovering ? '恢复中...' : '恢复任务'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 