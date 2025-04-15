"use client";

import { useEffect, useState, useRef } from 'react';
import useNotification from '@/hooks/useNotification';
import { debounce } from '@/lib/utils';

interface TaskStatusListenerProps {
  taskId: string;
  onStatusChange?: (status: string, data: any) => void;
  onCompleted?: (imageUrl: string) => void;
  onError?: (error: string) => void;
}

// 全局任务状态映射，防止重复通知
const taskNotifications = new Map<string, {
  lastStatus: string,
  timestamp: number,
  notified: boolean
}>();

// 清理过期任务通知记录
const cleanupTaskNotifications = () => {
  const now = Date.now();
  const EXPIRE_TIME = 5 * 60 * 1000; // 5分钟过期
  
  taskNotifications.forEach((data, taskId) => {
    if (now - data.timestamp > EXPIRE_TIME) {
      taskNotifications.delete(taskId);
    }
  });
};

// 如果在浏览器环境，设置定期清理
if (typeof window !== 'undefined') {
  setInterval(cleanupTaskNotifications, 60 * 1000); // 每分钟清理一次
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
  const isMounted = useRef<boolean>(true);
  
  // 使用防抖包装回调函数，防止短时间内多次触发
  const debouncedOnCompleted = useRef(
    debounce((imageUrl: string) => {
      if (!isMounted.current) return;
      console.log(`[TaskListener] 防抖后触发完成回调: ${imageUrl}`);
      onCompleted?.(imageUrl);
    }, 300)
  ).current;
  
  // 使用防抖包装错误回调函数
  const debouncedOnError = useRef(
    debounce((error: string) => {
      if (!isMounted.current) return;
      console.log(`[TaskListener] 防抖后触发错误回调: ${error}`);
      onError?.(error);
    }, 300)
  ).current;
  
  // 使用防抖包装状态变化回调函数
  const debouncedOnStatusChange = useRef(
    debounce((status: string, data: any) => {
      if (!isMounted.current) return;
      console.log(`[TaskListener] 防抖后触发状态变化回调: ${status}`);
      onStatusChange?.(status, data);
    }, 300)
  ).current;
  
  // 连接SSE
  useEffect(() => {
    if (!taskId) return;
    
    // 检查浏览器是否支持EventSource
    if (!window.EventSource) {
      console.error('浏览器不支持EventSource，将使用轮询模式');
      return;
    }
    
    console.log(`[TaskListener] 开始监听任务: ${taskId}`);
    
    // 标记组件已挂载
    isMounted.current = true;
    
    // 检查任务是否已通知过
    if (taskNotifications.has(taskId)) {
      const taskData = taskNotifications.get(taskId)!;
      
      // 如果任务已经成功完成并通知过，直接触发回调，无需重新连接
      if (taskData.lastStatus === 'completed' && taskData.notified) {
        console.log(`[TaskListener] 任务 ${taskId} 已经完成并通知过，跳过连接`);
        return;
      }
      
      // 如果任务已经失败并通知过，直接触发错误回调，无需重新连接
      if (taskData.lastStatus === 'failed' && taskData.notified) {
        console.log(`[TaskListener] 任务 ${taskId} 已经失败并通知过，跳过连接`);
        return;
      }
    }
    
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
        
        // 更新任务状态记录
        taskNotifications.set(taskId, {
          lastStatus: data.status,
          timestamp: Date.now(),
          notified: true
        });
        
        // 传递状态变化到父组件（使用防抖）
        debouncedOnStatusChange(data.status, data);
        
        // 任务完成时
        if (data.status === 'completed' && data.imageUrl) {
          console.log(`[TaskListener] 任务完成，图片URL: ${data.imageUrl}`);
          
          // 使用防抖函数触发完成回调
          debouncedOnCompleted(data.imageUrl);
          
          // 只在第一次收到完成状态时显示通知
          if (!taskNotifications.has(taskId) || 
              taskNotifications.get(taskId)!.lastStatus !== 'completed') {
            showNotification('图片生成成功!', 'success');
          }
          
          // 关闭连接
          sse.close();
          setEventSource(null);
        }
        
        // 任务失败时
        if (data.status === 'failed') {
          console.log(`[TaskListener] 任务失败: ${data.error_message || '未知错误'}`);
          
          // 使用防抖函数触发错误回调
          debouncedOnError(data.error_message || '图片生成失败');
          
          // 只在第一次收到失败状态时显示通知
          if (!taskNotifications.has(taskId) || 
              taskNotifications.get(taskId)!.lastStatus !== 'failed') {
            showNotification('图片生成失败', 'error');
          }
          
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
        if (isMounted.current) {
          sse.close();
          setEventSource(null);
        }
      }, 3000);
    };
    
    // 清理函数
    return () => {
      console.log(`[TaskListener] 清理SSE连接: ${taskId}`);
      isMounted.current = false;
      sse.close();
      setEventSource(null);
    };
  }, [taskId, debouncedOnCompleted, debouncedOnError, debouncedOnStatusChange, showNotification]);
  
  // 组件仅用于监听，不输出UI
  return null;
};

export default TaskStatusListener; 