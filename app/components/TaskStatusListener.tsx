"use client";

import React, { useEffect } from 'react';

interface TaskStatusListenerProps {
  taskId: string | null;
  onTaskCompleted: (imageUrl: string) => void;
  onTaskError: (error: string) => void;
}

export default function TaskStatusListener({
  taskId,
  onTaskCompleted,
  onTaskError
}: TaskStatusListenerProps) {
  useEffect(() => {
    if (!taskId) return;
    
    console.log(`[TaskStatusListener] 开始监听任务: ${taskId}`);
    
    // 这里通常会使用WebSocket或轮询API来监听任务状态
    // 为了简化示例，我们在这里使用一个模拟的状态更新
    const checkTaskStatus = () => {
      // 模拟任务完成
      setTimeout(() => {
        console.log(`[TaskStatusListener] 任务 ${taskId} 完成检查`);
        
        // 假设任务已完成，返回一个模拟的图片URL
        // 在实际实现中，这里应该是从后端API获取真实的任务状态
        onTaskCompleted(`https://example.com/generated-image-${taskId}.jpg`);
      }, 2000);
    };
    
    // 开始检查任务状态
    checkTaskStatus();
    
    // 清理函数
    return () => {
      console.log(`[TaskStatusListener] 停止监听任务: ${taskId}`);
      // 在实际实现中，这里应该清理轮询或关闭WebSocket连接
    };
  }, [taskId, onTaskCompleted, onTaskError]);
  
  // 这个组件不渲染任何UI元素
  return null;
} 