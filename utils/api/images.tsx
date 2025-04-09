import { useState, useEffect } from 'react';

interface ImageGenerationParams {
  prompt: string;
  style?: string;
  aspectRatio?: string;
}

interface ImageTaskResponse {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
  waitTime?: number;
}

// 创建图像生成任务
export async function createImageGenerationTask(params: ImageGenerationParams): Promise<string> {
  const response = await fetch('/api/generate-image-task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || '创建图像生成任务失败');
  }

  const data = await response.json();
  return data.taskId;
}

// 获取任务状态
export async function getImageTaskStatus(taskId: string): Promise<ImageTaskResponse> {
  const response = await fetch(`/api/image-task-status/${taskId}`);

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || '获取任务状态失败');
  }

  return await response.json();
}

// React Hook: 使用图像生成任务
export function useImageGeneration(params: ImageGenerationParams | null) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'processing' | 'completed' | 'failed'>('idle');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitTime, setWaitTime] = useState<number>(0);

  // 创建任务
  useEffect(() => {
    if (!params) return;

    let isMounted = true;
    
    const startGeneration = async () => {
      try {
        setStatus('pending');
        setError(null);
        setImageUrl(null);
        
        const newTaskId = await createImageGenerationTask(params);
        
        if (isMounted) {
          setTaskId(newTaskId);
        }
      } catch (err) {
        if (isMounted) {
          setStatus('failed');
          setError(err instanceof Error ? err.message : '创建任务失败');
        }
      }
    };

    startGeneration();

    return () => {
      isMounted = false;
    };
  }, [params]);

  // 轮询任务状态
  useEffect(() => {
    if (!taskId || status === 'completed' || status === 'failed') return;

    let isMounted = true;
    let intervalId: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const taskStatus = await getImageTaskStatus(taskId);
        
        if (!isMounted) return;
        
        setStatus(taskStatus.status);
        setWaitTime(taskStatus.waitTime || 0);

        if (taskStatus.status === 'completed' && taskStatus.imageUrl) {
          setImageUrl(taskStatus.imageUrl);
          clearInterval(intervalId);
        } else if (taskStatus.status === 'failed') {
          setError(taskStatus.error || '图像生成失败');
          clearInterval(intervalId);
        }
      } catch (err) {
        if (isMounted) {
          console.error('查询任务状态失败:', err);
          // 不设置失败状态，继续尝试
        }
      }
    };

    // 立即检查一次
    checkStatus();
    
    // 每2秒检查一次任务状态
    intervalId = setInterval(checkStatus, 2000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [taskId, status]);

  // 重试功能
  const retry = async () => {
    if (!params) return;
    
    setStatus('idle');
    setTaskId(null);
    // 让useEffect重新触发创建任务
  };

  return {
    status,
    imageUrl,
    error,
    waitTime,
    isLoading: status === 'pending' || status === 'processing',
    retry
  };
} 