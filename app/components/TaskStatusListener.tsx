"use client";

import { useEffect, useState } from 'react';
import useNotification from '@/hooks/useNotification';

interface TaskStatusListenerProps {
  taskId: string;
  onStatusChange?: (status: string, data: any) => void;
  onCompleted?: (imageUrl: string) => void;
  onError?: (error: string) => void;
}

const TaskStatusListener = ({ 
  taskId, 
  onStatusChange, 
  onCompleted, 
  onError 
}: TaskStatusListenerProps) => {
  const [connected, setConnected] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const { showNotification } = useNotification();
  
  // 连接SSE
  useEffect(() => {
    if (!taskId) return;
    
    // 检查浏览器是否支持EventSource
    if (!window.EventSource) {
      console.error('浏览器不支持EventSource，将使用轮询模式');
      return;
    }
    
    console.log(`[TaskListener] 开始监听任务: ${taskId}`);
    
    // 创建EventSource连接
    const sse = new EventSource(`/api/notify-task-update?taskId=${taskId}`);
    setEventSource(sse);
    
    // 连接打开时
    sse.onopen = () => {
      console.log(`[TaskListener] SSE连接已打开: ${taskId}`);
      setConnected(true);
    };
    
    // 接收消息时
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[TaskListener] 收到任务更新:`, data);
        
        // 传递状态变化到父组件
        onStatusChange?.(data.status, data);
        
        // 任务完成时
        if (data.status === 'completed' && data.imageUrl) {
          console.log(`[TaskListener] 任务完成，图片URL: ${data.imageUrl}`);
          onCompleted?.(data.imageUrl);
          showNotification('图片生成成功!', 'success');
          
          // 关闭连接
          sse.close();
          setEventSource(null);
        }
        
        // 任务失败时
        if (data.status === 'failed') {
          console.log(`[TaskListener] 任务失败: ${data.error_message || '未知错误'}`);
          onError?.(data.error_message || '图片生成失败');
          showNotification('图片生成失败', 'error');
          
          // 关闭连接
          sse.close();
          setEventSource(null);
        }
        
        // 连接关闭事件
        if (data.type === 'close') {
          console.log(`[TaskListener] 服务器请求关闭连接`);
          sse.close();
          setEventSource(null);
        }
      } catch (error) {
        console.error('[TaskListener] 处理SSE消息出错:', error);
      }
    };
    
    // 错误处理
    sse.onerror = (error) => {
      console.error(`[TaskListener] SSE连接错误:`, error);
      setConnected(false);
      
      // 尝试重新连接
      setTimeout(() => {
        sse.close();
        setEventSource(null);
      }, 3000);
    };
    
    // 清理函数
    return () => {
      console.log(`[TaskListener] 清理SSE连接: ${taskId}`);
      sse.close();
      setEventSource(null);
    };
  }, [taskId]);
  
  // 组件仅用于监听，不输出UI
  return null;
};

export default TaskStatusListener; 