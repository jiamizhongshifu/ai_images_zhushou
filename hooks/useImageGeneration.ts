import { useState, useRef, useEffect } from 'react';
import { generatePromptWithStyle } from '@/app/config/styles';
import { cacheService, CACHE_PREFIXES } from '@/utils/cache-service';
import { GenerationStage } from '@/components/ui/skeleton-generation';
import { v4 as uuid } from 'uuid';
import { useUserState } from '@/app/components/providers/user-state-provider';
import { compressImage, estimateBase64Size } from '@/utils/image/compressImage';

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
  
  // 任务ID和轮询间隔
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxPollingAttemptsRef = useRef<number>(300); // 最多轮询5分钟 (300 * 2秒 = 600秒)
  const pollingAttemptsRef = useRef<number>(0);
  const initialPollingInterval = 1000; // 初始轮询间隔1秒
  const maxPollingInterval = 10000; // 最大轮询间隔10秒
  const pollingBackoffFactor = 1.5; // 指数退避因子
  const currentPollingIntervalRef = useRef<number>(initialPollingInterval);
  const startTimeRef = useRef<number>(0); // 添加回startTimeRef
  
  // 任务状态缓存
  const taskStatusCache = useRef<Map<string, {data: any, timestamp: number}>>(new Map());
  const CACHE_TTL = 5000; // 缓存有效期5秒

  const { triggerCreditRefresh } = useUserState();

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
  
  // 停止所有计时器
  const clearAllTimers = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    // 重置轮询相关参数
    pollingAttemptsRef.current = 0;
    currentPollingIntervalRef.current = initialPollingInterval;
  };

  // 清理函数 - 组件卸载时调用
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

  // 基于等待时间动态计算显示的阶段和进度
  const calculateStageFromWaitTime = (waitTime: number): [GenerationStage, number] => {
    if (waitTime < 5) return ['preparing', 5];
    if (waitTime < 10) return ['configuring', 10];
    if (waitTime < 15) return ['sending_request', 20];
    if (waitTime < 30) return ['processing', 30 + Math.min(30, waitTime)];
    if (waitTime < 120) return ['processing', Math.min(80, 30 + waitTime / 2)];
    return ['extracting_image', Math.min(85, 60 + waitTime / 10)];
  };

  // 启动任务状态轮询，使用指数退避策略
  const startPollingTaskStatus = (taskId: string) => {
    clearAllTimers();

    // 记录开始时间
    startTimeRef.current = Date.now();
    
    // 立即检查一次
    checkTaskStatus(taskId);
    
    // 使用setTimeout替代setInterval，以便动态调整轮询间隔
    const scheduleNextPoll = () => {
      pollingIntervalRef.current = setTimeout(() => {
        // 增加尝试次数
        pollingAttemptsRef.current++;
        
        // 检查是否达到最大尝试次数
        if (pollingAttemptsRef.current > maxPollingAttemptsRef.current) {
          console.warn(`[useImageGeneration] 达到最大轮询次数(${maxPollingAttemptsRef.current})，停止轮询`);
          clearAllTimers();
          setError("生成图片耗时过长，请检查任务状态或重试");
          setIsGenerating(false);
          setStatus('error');
          notify("图片生成耗时过长，可能已超时", 'info');
          return;
        }
        
        // 执行状态检查
        checkTaskStatus(taskId)
          .finally(() => {
            // 如果仍在生成中，安排下一次轮询
            if (isGenerating) {
              // 仅在前10次尝试后开始增加间隔
              if (pollingAttemptsRef.current > 10) {
                // 使用指数退避增加轮询间隔
                currentPollingIntervalRef.current = Math.min(
                  currentPollingIntervalRef.current * pollingBackoffFactor,
                  maxPollingInterval
                );
                console.log(`[useImageGeneration] 轮询间隔调整为: ${currentPollingIntervalRef.current}ms`);
              }
              
              // 安排下一次检查
              scheduleNextPoll();
            }
          });
      }, currentPollingIntervalRef.current);
    };
    
    // 开始轮询调度
    scheduleNextPoll();
  };

  // 检查任务状态（添加缓存机制）
  const checkTaskStatus = async (taskId: string) => {
    try {
      // 检查缓存中是否有有效数据
      const cachedData = taskStatusCache.current.get(taskId);
      const now = Date.now();
      
      // 如果存在有效缓存，则使用缓存数据
      if (cachedData && (now - cachedData.timestamp < CACHE_TTL)) {
        // 5秒内的数据使用缓存
        console.log('[useImageGeneration] 使用缓存的任务状态');
        handleTaskStatusUpdate(cachedData.data);
        return;
      }
      
      const response = await fetch(`/api/image-task-status/${taskId}`);
      const data = await response.json();
      
      // 更新缓存
      taskStatusCache.current.set(taskId, {
        data,
        timestamp: now
      });
      
      // 处理任务状态更新
      handleTaskStatusUpdate(data);
    } catch (err) {
      console.error('检查任务状态失败:', err);
      // 暂不设置错误，继续轮询
    }
  };
  
  // 分离状态处理逻辑，使代码更清晰
  const handleTaskStatusUpdate = (data: any) => {
    // 计算已等待时间
    const waitTime = data.waitTime || Math.floor((Date.now() - startTimeRef.current) / 1000);
    
    // 基于状态更新UI
    switch (data.status) {
      case 'completed':
        // 更新进度到85%
        updateGenerationStage('extracting_image', 85);
        
        // 完成阶段
        setTimeout(() => {
          updateGenerationStage('finalizing', 95);
          
          // 延迟后显示完成
          setTimeout(async () => {
            updateGenerationStage('completed', 100);
            
            // 停止轮询
            clearAllTimers();
            
            // 更新UI状态
            setIsGenerating(false);
            setStatus('success');
            setCurrentTaskId(null);
            
            // 添加生成的图片
            if (data.imageUrl) {
              addGeneratedImage(data.imageUrl);
              
              // 刷新缓存
              cacheService.delete(USER_CREDITS_CACHE_KEY);
              cacheService.delete(HISTORY_CACHE_KEY);
              
              // 调用回调函数 - 移除triggerCreditRefresh调用，统一由外部页面处理
              if (refreshHistory) {
                const result = refreshHistory();
                // 如果返回Promise则等待完成
                if (result instanceof Promise) {
                  await result;
                }
              }
              if (onSuccess) onSuccess(data.imageUrl);
              
              // 显示成功通知
              notify('图片生成成功！', 'success');
            }
          }, 300);
        }, 300);
        break;
        
      case 'failed':
        // 更新为失败状态
        updateGenerationStage('failed', 0);
        setError(data.error || '图像生成失败');
        setIsGenerating(false);
        setStatus('error');
        setCurrentTaskId(null);
        
        // 停止轮询
        clearAllTimers();
        
        // 显示错误通知
        notify(`生成失败: ${data.error || '未知错误'}`, 'error');
        break;
        
      case 'pending':
      case 'processing':
      default:
        // 根据等待时间动态更新阶段和进度
        const [stage, percentage] = calculateStageFromWaitTime(waitTime);
        updateGenerationStage(stage, percentage);
        break;
    }
  };

  // 生成图片 - 调用异步API
  const generateImage = async (options: GenerationOptions): Promise<{taskId: string} | null> => {
    const { prompt, image, style, aspectRatio, standardAspectRatio } = options;
    
    if (!prompt.trim() && !image && (!style || style === '自定义')) {
      setError("请输入提示词，或上传图片并选择艺术风格");
      return null;
    }
    
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
      
      // 保存任务ID并开始轮询
      setCurrentTaskId(data.taskId);
      console.log(`[useImageGeneration] 创建任务成功，任务ID: ${data.taskId}`);
      
      // 开始轮询任务状态
      updateGenerationStage('processing', 30);
      startPollingTaskStatus(data.taskId);
      
      return { taskId: data.taskId }; // 返回任务ID以支持外部状态监听
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

  return {
    generatedImages,
    status,
    isGenerating,
    error,
    generateImage,
    setGeneratedImages,
    addGeneratedImage,
    generationStage,
    generationPercentage
  };
} 