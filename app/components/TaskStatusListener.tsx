"use client";

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';

interface TaskStatusListenerProps {
  taskId: string;
  onCompleted: (imageUrl: string) => void;
  onError: (error: string) => void;
}

/**
 * 任务状态监听组件 - 使用Server-Sent Events监听任务状态变化
 */
export default function TaskStatusListener({ taskId, onCompleted, onError }: TaskStatusListenerProps) {
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) return;

    console.log(`[TaskStatusListener] 开始监听任务: ${taskId}`);
    
    // 创建事件源
    let retryCount = 0;
    const maxRetries = 3;
    let retryTimeout: NodeJS.Timeout;
    
    const connectEventSource = () => {
      try {
        // 关闭之前的连接
        if (eventSource) {
          eventSource.close();
        }
        
        // 创建新的SSE连接
        const newEventSource = new EventSource(`/api/tasks/stream/${taskId}`);
        setEventSource(newEventSource);
        
        // 连接成功事件
        newEventSource.onopen = () => {
          console.log(`[TaskStatusListener] 已连接到任务状态流: ${taskId}`);
          retryCount = 0; // 重置重试次数
        };
        
        // 监听消息事件
        newEventSource.addEventListener('message', (event) => {
          try {
            console.log(`[TaskStatusListener] 收到消息:`, event.data);
            const data = JSON.parse(event.data);
            
            // 处理任务完成
            if (data.status === 'completed' && data.imageUrl) {
              console.log(`[TaskStatusListener] 任务完成，图片URL: ${data.imageUrl}`);
              onCompleted(data.imageUrl);
              newEventSource.close();
            }
            
            // 处理任务失败
            if (data.status === 'failed' || data.status === 'cancelled') {
              console.log(`[TaskStatusListener] 任务失败: ${data.error || '未知错误'}`);
              onError(data.error || '任务处理失败');
              newEventSource.close();
            }
          } catch (error) {
            console.error('[TaskStatusListener] 处理消息时出错:', error);
          }
        });
        
        // 监听错误事件
        newEventSource.onerror = (error) => {
          console.error(`[TaskStatusListener] 事件源错误:`, error);
          
          // 连接失败时重试
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`[TaskStatusListener] 尝试重新连接 (${retryCount}/${maxRetries})...`);
            
            // 关闭当前连接
            newEventSource.close();
            
            // 延迟重试
            retryTimeout = setTimeout(() => {
              connectEventSource();
            }, 2000 * retryCount); // 指数退避
          } else {
            console.error(`[TaskStatusListener] 达到最大重试次数，停止重试`);
            // 切换到轮询模式获取任务状态
            pollTaskStatus();
          }
        };
      } catch (error) {
        console.error('[TaskStatusListener] 创建事件源时出错:', error);
        // 失败时使用轮询方式
        pollTaskStatus();
      }
    };
    
    // 备用轮询方式
    const pollTaskStatus = async () => {
      console.log(`[TaskStatusListener] 切换到轮询模式: ${taskId}`);
      
      try {
        const response = await fetch(`/api/image-task-status/${taskId}`);
        if (response.ok) {
          const data = await response.json();
          
          if (data.status === 'completed' && data.imageUrl) {
            console.log(`[TaskStatusListener] 轮询发现任务已完成: ${data.imageUrl}`);
            onCompleted(data.imageUrl);
            return; // 任务完成，停止轮询
          }
          
          if (data.status === 'failed' || data.status === 'cancelled') {
            console.log(`[TaskStatusListener] 轮询发现任务已失败: ${data.error || '未知错误'}`);
            onError(data.error || '任务处理失败');
            return; // 任务失败，停止轮询
          }
          
          // 任务仍在进行中，继续轮询
          setTimeout(pollTaskStatus, 5000);
        } else {
          // 请求失败，可能是网络问题，稍后重试
          console.error(`[TaskStatusListener] 轮询请求失败: ${response.status}`);
          toast.error('任务状态检查失败，将在5秒后重试');
          setTimeout(pollTaskStatus, 5000);
        }
      } catch (error) {
        console.error('[TaskStatusListener] 轮询出错:', error);
        toast.error('任务状态检查出错，将在5秒后重试');
        setTimeout(pollTaskStatus, 5000);
      }
    };
    
    // 启动监听
    connectEventSource();
    
    // 组件卸载时清理
    return () => {
      console.log(`[TaskStatusListener] 停止监听任务: ${taskId}`);
      if (eventSource) {
        eventSource.close();
      }
      clearTimeout(retryTimeout);
    };
  }, [taskId, onCompleted, onError]);

  return null;
} 