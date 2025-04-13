import { useState, useRef, useEffect } from 'react';
import { generatePromptWithStyle } from '@/app/config/styles';
import { cacheService, CACHE_PREFIXES } from '@/utils/cache-service';
import { GenerationStage } from '@/components/ui/skeleton-generation';
import { v4 as uuid } from 'uuid';
import { useUserState } from '@/app/components/providers/user-state-provider';
import { compressImage, estimateBase64Size } from '@/utils/image/compressImage';
import { 
  savePendingTask, 
  getPendingTask, 
  updatePendingTaskStatus, 
  clearPendingTask,
  getAllPendingTasks,
  isSameRequest,
  cleanupExpiredTasks,
  PendingTask
} from '@/utils/taskRecovery';
import { enhancedPollTaskStatus } from '@/utils/taskPoller';

// 图片大小限制配置
const MAX_IMAGE_SIZE_KB = 6144; // 6MB
const MAX_IMAGE_WIDTH = 1024;
const MAX_IMAGE_HEIGHT = 1024;
const DEFAULT_QUALITY = 0.8;

const USER_CREDITS_CACHE_KEY = CACHE_PREFIXES.USER_CREDITS + ':main';
const HISTORY_CACHE_KEY = CACHE_PREFIXES.HISTORY + ':recent';

export type GenerationStatus = 'idle' | 'loading' | 'success' | 'error';

export interface GenerationOptions {
  prompt: string;
  image?: string | null;
  style?: string;
  aspectRatio?: string | null;
  standardAspectRatio?: string | null;
}

export interface UseImageGenerationResult {
  generatedImages: string[];
  status: GenerationStatus;
  isGenerating: boolean;
  error: string | null;
  generateImage: (options: GenerationOptions) => Promise<{taskId: string} | null>;
  setGeneratedImages: (images: string[]) => void;
  addGeneratedImage: (imageUrl: string) => void;
  generationStage: GenerationStage;
  generationPercentage: number;
  recoverTask: (taskId: string) => Promise<boolean>;
  discardTask: (taskId: string) => void;
  checkPendingTask: () => PendingTask | null;
}

type NotificationCallback = (message: string, type: 'success' | 'error' | 'info') => void;

/**
 * 自定义Hook用于处理图片生成 - 使用异步任务系统
 */
export default function useImageGeneration(
  onNotify?: NotificationCallback,
  onSuccess?: (imageUrl: string) => void,
  refreshHistory?: () => void | Promise<void>
): UseImageGenerationResult {
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generationStage, setGenerationStage] = useState<GenerationStage>('preparing');
  const [generationPercentage, setGenerationPercentage] = useState<number>(0);
  
  // 任务ID和监控引用
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const pollingCancelRef = useRef<() => void>(() => {}); // 用于取消轮询

  const { triggerCreditRefresh } = useUserState();

  // 页面加载时清理过期任务
  useEffect(() => {
    try {
      cleanupExpiredTasks();
    } catch (error) {
      console.error('[useImageGeneration] 清理过期任务失败:', error);
    }
  }, []);

  // 清理函数 - 组件卸载时调用
  useEffect(() => {
    return () => {
      // 取消任何进行中的轮询
      if (pollingCancelRef.current) {
        pollingCancelRef.current();
      }
    };
  }, []);

  // 获取最新的未完成任务
  const checkPendingTask = (): PendingTask | null => {
    try {
      // 获取所有未完成任务
      const tasks = getAllPendingTasks();
      if (!tasks || tasks.length === 0) return null;
      
      // 按时间排序，获取最近的任务
      const latestTasks = tasks.sort((a, b) => b.timestamp - a.timestamp);
      
      // 只关注pending或processing状态的任务
      const pendingTask = latestTasks.find(task => 
        ['pending', 'processing', 'created'].includes(task.status)
      );
      
      if (pendingTask) {
        // 检查任务是否不太旧（24小时内）
        if (Date.now() - pendingTask.timestamp < 24 * 60 * 60 * 1000) {
          return pendingTask;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[useImageGeneration] 检查未完成任务失败:', error);
      return null;
    }
  };

  // 添加生成的图片到列表
  const addGeneratedImage = (imageUrl: string) => {
    setGeneratedImages(prev => {
      // 检查URL是否已存在
      if (prev.includes(imageUrl)) {
        return prev;
      }
      // 将新图片添加到数组开头
      return [imageUrl, ...prev];
    });
  };

  // 显示通知
  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (onNotify) {
      onNotify(message, type);
    } else {
      console.log(`[通知-${type}] ${message}`);
    }
  };

  // 更新生成阶段
  const updateGenerationStage = (stage: GenerationStage, percentage: number) => {
    setGenerationStage(stage);
    setGenerationPercentage(percentage);
    console.log(`[useImageGeneration] 生成阶段: ${stage}, 进度: ${percentage}%`);
  };

  // 基于等待时间动态计算显示的阶段和进度
  const calculateStageFromWaitTime = (waitTime: number): [GenerationStage, number] => {
    if (waitTime < 5) return ['preparing', 5];
    if (waitTime < 10) return ['configuring', 10];
    if (waitTime < 15) return ['sending_request', 20];
    if (waitTime < 30) return ['processing', 30 + Math.min(30, waitTime)];
    if (waitTime < 120) return ['processing', Math.min(80, 30 + waitTime / 2)];
    return ['extracting_image', Math.min(85, 60 + waitTime / 10)];
  };

  // 启动增强型任务状态轮询
  const startEnhancedPollingTaskStatus = (taskId: string) => {
    // 取消任何进行中的轮询
    if (pollingCancelRef.current) {
      pollingCancelRef.current();
    }

    // 记录开始时间
    startTimeRef.current = Date.now();
    
    // 创建一个可取消的轮询
    let cancelled = false;
    pollingCancelRef.current = () => {
      cancelled = true;
      console.log(`[useImageGeneration] 已取消任务${taskId}的轮询`);
    };
    
    // 启动增强轮询
    enhancedPollTaskStatus(taskId, {
      maxAttempts: 180,         // 最多尝试180次 (约15分钟，视间隔而定)
      initialInterval: 2000,    // 初始间隔2秒
      maxInterval: 10000,       // 最大间隔10秒
      exponentialFactor: 1.5,   // 指数增长因子
      failureRetries: 3,        // 连续失败重试次数
      onProgress: (progress, stage) => {
        if (cancelled) return;
        updateGenerationStage(stage as GenerationStage, progress);
      },
      onStateChange: (state) => {
        if (cancelled) return;
        console.log(`[useImageGeneration] 任务${taskId}状态变更: ${state}`);
      }
    })
    .then(async (result) => {
      if (cancelled) return;
      
      console.log(`[useImageGeneration] 任务${taskId}轮询完成，状态: 成功，尝试次数: ${result.attempts}，耗时: ${result.elapsedTime}ms`);
      
      // 更新为完成阶段
      updateGenerationStage('finalizing', 95);
      
      // 短暂延迟后显示完成
      setTimeout(async () => {
        if (cancelled) return;
        
        updateGenerationStage('completed', 100);
        
        // 更新UI状态
        setIsGenerating(false);
        setStatus('success');
        setCurrentTaskId(null);
        
        // 清除任务本地存储
        clearPendingTask(taskId);
        
        // 添加生成的图片
        if (result.data?.imageUrl) {
          addGeneratedImage(result.data.imageUrl);
          
          // 刷新缓存
          cacheService.delete(USER_CREDITS_CACHE_KEY);
          cacheService.delete(HISTORY_CACHE_KEY);
          
          // 刷新用户积分
          if (triggerCreditRefresh) {
            triggerCreditRefresh();
          }
          
          // 调用回调函数
          if (refreshHistory) {
            const refreshResult = refreshHistory();
            // 如果返回Promise则等待完成
            if (refreshResult instanceof Promise) {
              await refreshResult;
            }
          }
          if (onSuccess) onSuccess(result.data.imageUrl);
          
          // 显示成功通知
          notify('图片生成成功！', 'success');
        }
      }, 300);
    })
    .catch((error) => {
      if (cancelled) return;
      
      console.error(`[useImageGeneration] 任务${taskId}轮询失败:`, error);
      
      // 更新为失败状态
      updateGenerationStage('failed', 0);
      setError(error.error || '图像生成失败');
      setIsGenerating(false);
      setStatus('error');
      setCurrentTaskId(null);
      
      // 更新任务本地存储状态
      updatePendingTaskStatus(
        taskId, 
        'failed', 
        error.error || '图像生成失败'
      );
      
      // 显示错误通知
      notify(`生成失败: ${error.error || '未知错误'}`, 'error');
    });
  };

  // 生成图片 - 调用异步API
  const generateImage = async (options: GenerationOptions): Promise<{taskId: string} | null> => {
    const { prompt, image, style, aspectRatio, standardAspectRatio } = options;
    
    if (!prompt.trim() && !image && (!style || style === '自定义')) {
      setError("请输入提示词，或上传图片并选择艺术风格");
      return null;
    }
    
    // 检查是否有未完成的相同任务
    const pendingTask = checkPendingTask();
    if (pendingTask && isSameRequest(pendingTask, options)) {
      console.log(`[useImageGeneration] 检测到未完成的相同任务: ${pendingTask.taskId}`);
      notify("继续处理之前的相同请求...", 'info');
      
      // 更新状态
      setError(null);
      setIsGenerating(true);
      setStatus('loading');
      setCurrentTaskId(pendingTask.taskId);
      startTimeRef.current = pendingTask.timestamp;
      
      // 基于等待时间更新进度
      const waitTime = Math.floor((Date.now() - pendingTask.timestamp) / 1000);
      const [stage, percentage] = calculateStageFromWaitTime(waitTime);
      updateGenerationStage(stage, percentage);
      
      // 开始恢复轮询
      startEnhancedPollingTaskStatus(pendingTask.taskId);
      
      return { taskId: pendingTask.taskId };
    }
    
    // 开始新的任务生成流程
    setError(null);
    setIsGenerating(true);
    setStatus('loading');
    startTimeRef.current = Date.now();
    
    // 重置进度状态
    updateGenerationStage('preparing', 5);
    
    try {
      // 准备参数阶段
      await new Promise(resolve => setTimeout(resolve, 500));
      updateGenerationStage('configuring', 10);
      
      // 使用配置文件中的辅助函数生成完整提示词
      const fullPrompt = style ? 
        generatePromptWithStyle(style, prompt.trim()) : 
        prompt.trim();
      
      // 检查并压缩图片
      let processedImage = image;
      if (image) {
        // 估算图片大小
        const estimatedSize = estimateBase64Size(image);
        console.log(`[useImageGeneration] 原始图片大小: ~${estimatedSize}KB`);
        
        // 如果图片大于限制，进行压缩
        if (estimatedSize > MAX_IMAGE_SIZE_KB) {
          updateGenerationStage('preparing', 7); // 更新进度以表示正在压缩
          console.log(`[useImageGeneration] 图片超过大小限制(${MAX_IMAGE_SIZE_KB}KB)，开始压缩...`);
          
          try {
            processedImage = await compressImage(
              image,
              {
                maxWidth: MAX_IMAGE_WIDTH,
                maxHeight: MAX_IMAGE_HEIGHT,
                quality: DEFAULT_QUALITY
              }
            );
            
            const newSize = estimateBase64Size(processedImage);
            console.log(`[useImageGeneration] 压缩完成，新大小: ~${newSize}KB (压缩率: ${(newSize/estimatedSize*100).toFixed(1)}%)`);
            
            // 如果压缩后仍然超过限制
            if (newSize > MAX_IMAGE_SIZE_KB) {
              console.warn(`[useImageGeneration] 警告：压缩后仍超过${MAX_IMAGE_SIZE_KB}KB，可能导致请求失败`);
              notify(`图片尺寸较大(${(newSize/1024).toFixed(1)}MB)，可能影响生成速度或失败`, 'info');
            }
          } catch (compressError) {
            console.error('[useImageGeneration] 图片压缩失败:', compressError);
            notify('图片压缩失败，将使用原图，可能导致请求超时', 'info');
          }
        }
      }
      
      // 准备API请求数据
      const requestData = {
        prompt: fullPrompt,
        image: processedImage || undefined,
        style: style !== "自定义" ? style : undefined,
        aspectRatio,
        standardAspectRatio
      };
      
      // 更详细的日志，包括完整的图片信息
      console.log('[useImageGeneration] 开始生成图片，参数详情:');
      console.log(`- 提示词: ${fullPrompt.length > 100 ? fullPrompt.substring(0, 100) + '...' : fullPrompt}`);
      console.log(`- 风格: ${requestData.style || '(自定义)'}`);
      console.log(`- 比例: ${aspectRatio || '(默认)'} / 标准比例: ${standardAspectRatio || '(默认)'}`);
      
      // 记录图片信息但不输出完整base64以避免日志过大
      if (processedImage) {
        const imgPrefix = processedImage.substring(0, 30);
        const imgLength = processedImage.length;
        console.log(`- 图片数据: ${imgPrefix}... (长度: ${imgLength}字符)`);
      } else {
        console.log(`- 图片数据: 无`);
      }
      
      // 发送请求阶段
      updateGenerationStage('sending_request', 20);
      
      // 调用异步API创建任务
      const response = await fetch("/api/generate-image-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });
      
      // 检查响应状态
      if (response.status === 413) {
        throw new Error('图片尺寸过大，请使用较小的图片或降低图片质量');
      }
      
      const data = await response.json().catch(err => {
        console.error('[useImageGeneration] 解析创建任务响应失败:', err);
        return { error: '解析响应数据失败' };
      });
      
      if (!response.ok || !data.taskId) {
        throw new Error(data.error || `创建图像任务失败: HTTP ${response.status}`);
      }
      
      // 保存任务ID
      const taskId = data.taskId;
      setCurrentTaskId(taskId);
      console.log(`[useImageGeneration] 创建任务成功，任务ID: ${taskId}`);
      
      // 保存任务到本地存储
      savePendingTask({
        taskId,
        params: options,
        timestamp: Date.now(),
        status: 'processing'
      });
      
      // 开始轮询任务状态
      updateGenerationStage('processing', 30);
      startEnhancedPollingTaskStatus(taskId);
      
      return { taskId }; // 返回任务ID以支持外部状态监听
    } catch (err) {
      // 处理错误
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useImageGeneration] 生成图片失败:', errorMessage);
      
      // 更新状态
      setError(errorMessage);
      setIsGenerating(false);
      setStatus('error');
      updateGenerationStage('failed', 0);
      
      // 显示错误通知
      notify(`生成失败: ${errorMessage}`, 'error');
      
      return null;
    }
  };

  // 恢复任务处理
  const recoverTask = async (taskId: string): Promise<boolean> => {
    try {
      const task = getPendingTask(taskId);
      if (!task) {
        notify(`任务 ${taskId} 不存在`, 'error');
        return false;
      }
      
      // 更新状态
      setError(null);
      setIsGenerating(true);
      setStatus('loading');
      setCurrentTaskId(task.taskId);
      startTimeRef.current = task.timestamp;
      
      // 更新任务状态
      updatePendingTaskStatus(task.taskId, 'recovering');
      
      // 显示通知
      notify(`恢复任务 ${task.taskId}...`, 'info');
      
      // 检查任务状态
      const response = await fetch(`/api/image-task-status/${task.taskId}`);
      
      if (!response.ok) {
        throw new Error(`检查任务状态失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 根据任务状态处理
      switch (data.status) {
        case 'completed':
          // 任务已完成，直接显示结果
          updateGenerationStage('completed', 100);
          setIsGenerating(false);
          setStatus('success');
          setCurrentTaskId(null);
          
          if (data.imageUrl) {
            addGeneratedImage(data.imageUrl);
            if (onSuccess) onSuccess(data.imageUrl);
          }
          
          clearPendingTask(task.taskId);
          notify('任务已完成', 'success');
          return true;
          
        case 'failed':
          // 任务失败，显示错误
          updateGenerationStage('failed', 0);
          setIsGenerating(false);
          setStatus('error');
          setCurrentTaskId(null);
          setError(data.error || '任务处理失败');
          
          clearPendingTask(task.taskId);
          notify(`任务处理失败: ${data.error || '未知错误'}`, 'error');
          return false;
          
        case 'cancelled':
          // 任务已取消
          updateGenerationStage('failed', 0);
          setIsGenerating(false);
          setStatus('error');
          setCurrentTaskId(null);
          setError('任务已被取消');
          
          clearPendingTask(task.taskId);
          notify('任务已被取消', 'info');
          return false;
          
        case 'pending':
        case 'processing':
          // 任务仍在进行中，恢复轮询
          const waitTime = Math.floor((Date.now() - task.timestamp) / 1000);
          const [stage, percentage] = calculateStageFromWaitTime(waitTime);
          updateGenerationStage(stage, percentage);
          
          notify(`继续轮询任务状态，当前状态: ${data.status}`, 'info');
          startEnhancedPollingTaskStatus(task.taskId);
          return true;
          
        default:
          // 未知状态，视为错误
          setError(`未知任务状态: ${data.status}`);
          setIsGenerating(false);
          setStatus('error');
          setCurrentTaskId(null);
          
          updatePendingTaskStatus(task.taskId, 'error', `未知任务状态: ${data.status}`);
          notify(`未知任务状态: ${data.status}`, 'error');
          return false;
      }
    } catch (error) {
      // 处理错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('恢复任务失败:', errorMessage);
      
      setError(errorMessage);
      setIsGenerating(false);
      setStatus('error');
      setCurrentTaskId(null);
      
      notify(`恢复任务失败: ${errorMessage}`, 'error');
      return false;
    }
  };

  // 放弃任务
  const discardTask = (taskId: string): void => {
    clearPendingTask(taskId);
    notify('已放弃任务', 'info');
  };

  return {
    generatedImages,
    status,
    isGenerating,
    error,
    generateImage,
    setGeneratedImages,
    addGeneratedImage,
    generationStage,
    generationPercentage,
    recoverTask,
    discardTask,
    checkPendingTask
  };
} 