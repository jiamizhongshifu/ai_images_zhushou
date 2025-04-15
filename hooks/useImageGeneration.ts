import { useState, useRef, useEffect, useCallback } from 'react';
import { generatePromptWithStyle } from '@/app/config/styles';
import { cacheService, CACHE_PREFIXES } from '@/utils/cache-service';
import { GenerationStage } from '@/components/ui/skeleton-generation';
import { v4 as uuid } from 'uuid';
import { useUserState } from '@/app/components/providers/user-state-provider';
import { compressImage, estimateBase64Size } from '@/utils/image/compressImage';
import { 
  savePendingTask, 
  getPendingTask, 
  updateTaskStatus,
  clearPendingTask,
  getAllPendingTasks,
  isSameRequest,
  cleanupExpiredTasks,
  shouldRecoverTask,
  isTaskExpired,
  isTaskActive,
} from '@/utils/taskRecovery';
import { enhancedPollTaskStatus, PollOptions, PollingResult, PollingState } from '@/utils/taskPoller';
import { TaskSyncManager } from '@/utils/taskSync/taskSyncManager';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n/client';
import { notify, showNotification } from '@/utils/notification';
import { trackPromptUsage } from '@/utils/tracking';
import { authService } from '@/utils/auth-service';
import logger from '@/utils/logger';
import { useSession } from 'next-auth/react';
import { v4 as uuidv4 } from 'uuid';
import { TASK_CONFIG } from '@/constants/taskConfig';
import { TaskStatus, Task, PendingTask } from '@/types/task';

// 图片大小限制配置
const MAX_IMAGE_SIZE_KB = 6144; // 6MB
const MAX_IMAGE_WIDTH = 1024;
const MAX_IMAGE_HEIGHT = 1024;
const DEFAULT_QUALITY = 0.8;

const USER_CREDITS_CACHE_KEY = CACHE_PREFIXES.USER_CREDITS + ':main';
const HISTORY_CACHE_KEY = CACHE_PREFIXES.HISTORY + ':recent';

// 添加常量配置
const SUBMIT_LOCK_TIMEOUT = 5000; // 5秒内不允许重复提交

export type GenerationStatus = 'idle' | 'loading' | 'success' | 'error';

export interface GenerationOptions {
  prompt: string;
  image?: string | null;
  style?: string;
  aspectRatio?: string | null;
  standardAspectRatio?: string | null;
  forced?: boolean;  // 添加强制生成选项，即使有重复任务也继续生成
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

  // 添加提交锁定 - 已弃用，使用 TaskSyncManager.hasSubmissionLock() 替代
  // @deprecated 使用 TaskSyncManager.hasSubmissionLock() 和 TaskSyncManager.setSubmitLock() 替代
  const submissionLockRef = useRef<boolean>(false);
  const lastSubmitTimeRef = useRef<number>(0);

  const { t } = useTranslation('image');
  const router = useRouter();

  const session = useSession();

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
        [TaskStatus.PENDING, TaskStatus.PROCESSING].includes(task.status)
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
      failureRetries: 0,        // 连续失败不重试
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
      
      // 更新跨标签页任务状态
      TaskSyncManager.updateTaskStatus(taskId, 'completed');
      
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
      
      // 更新跨标签页任务状态
      TaskSyncManager.updateTaskStatus(taskId, 'failed');
      
      // 更新为失败状态
      updateGenerationStage('failed', 0);
      setError(error.error || '图像生成失败');
      setIsGenerating(false);
      setStatus('error');
      setCurrentTaskId(null);
      
      // 更新任务本地存储状态
      updateTaskStatus(taskId, TaskStatus.FAILED, {
        error: error.error || 'UNKNOWN_ERROR',
        errorMessage: error.error || '图片生成失败'
      });
      
      // 显示错误通知
      notify(`生成失败: ${error.error || '未知错误'}`, 'error');
    });
  };

  // 处理轮询结果的函数
  const handlePollingResult = useCallback((result: any, taskId: string) => {
    if (result.status === TaskStatus.COMPLETED && result.data?.imageUrl) {
      // 更新UI状态
      setIsGenerating(false);
      setStatus('success');
      setCurrentTaskId(null);
      updateGenerationStage('completed', 100);
      
      // 添加生成的图片
      addGeneratedImage(result.data.imageUrl);
      
      // 清除任务本地存储
      clearPendingTask(taskId);
      
      // 显示成功通知
      notify('图片生成成功！', 'success');
      
      // 刷新其他数据
      cacheService.delete(USER_CREDITS_CACHE_KEY);
      cacheService.delete(HISTORY_CACHE_KEY);
      if (triggerCreditRefresh) triggerCreditRefresh();
      if (refreshHistory) refreshHistory();
    } else if (result.status === TaskStatus.FAILED || result.status === TaskStatus.CANCELLED) {
      // 更新失败状态,但保持UI不变
      console.log(`[useImageGeneration] 任务${taskId}失败,但保持UI状态`);
      
      // 更新任务本地存储状态
      updateTaskStatus(taskId, TaskStatus.FAILED, {
        error: result.error || 'UNKNOWN_ERROR',
        errorMessage: result.error || '图片生成失败'
      });
      
      // 显示错误通知
      notify(`生成失败: ${result.error || '未知错误'}`, 'error');
    }
  }, [triggerCreditRefresh, refreshHistory]);

  // 添加useEffect钩子来初始化任务同步监听器
  useEffect(() => {
    // 初始化任务状态同步监听
    const cleanup = TaskSyncManager.initListener({
      onTaskUpdate: (taskInfo) => {
        // 处理任务状态更新事件
        if (taskInfo.taskId === currentTaskId) {
          console.log(`[useImageGeneration] 从其他标签页接收到任务更新: ${taskInfo.taskId}, 状态: ${taskInfo.status}`);
          
          // 如果状态是完成或失败，更新本地状态
          if (taskInfo.status === TaskStatus.COMPLETED) {
            // 任务已完成，但需要查询详细信息
            fetch(`/api/image-task-status/${taskInfo.taskId}`)
              .then(resp => resp.json())
              .then(data => {
                if (data.imageUrl) {
                  addGeneratedImage(data.imageUrl);
                  setIsGenerating(false);
                  setStatus('success');
                  setCurrentTaskId(null);
                  updateGenerationStage('completed', 100);
                  clearPendingTask(taskInfo.taskId);
                  notify('图片生成成功！', 'success');
                }
              })
              .catch(err => console.error('获取完成任务详情失败:', err));
          } else if (taskInfo.status === TaskStatus.FAILED) {
            setIsGenerating(false);
            setStatus('error');
            setCurrentTaskId(null);
            updateGenerationStage('failed', 0);
            clearPendingTask(taskInfo.taskId);
            notify('任务处理失败', 'error');
          }
        }
      },
      onSubmitLock: () => {
        // 当其他标签页设置提交锁定时，更新最后提交时间
        lastSubmitTimeRef.current = Date.now();
        console.log('[useImageGeneration] 收到其他标签页的提交锁定信号');
      }
    });
    
    // 组件卸载时清理监听器
    return () => {
      cleanup();
    };
  }, [currentTaskId]);

  // 添加一个页面加载时自动检查和恢复任务的逻辑
  useEffect(() => {
    try {
      // 在组件挂载时清理过期任务
      cleanupExpiredTasks();
      
      // 检查是否有未完成的任务
      const pendingTask = checkPendingTask();
      if (pendingTask && !isGenerating) {
        console.log(`[useImageGeneration] 页面加载时检测到未完成任务: ${pendingTask.taskId}`);
        
        // 询问用户是否要恢复任务
        const shouldRecover = window.confirm(
          `检测到您有一个未完成的图片生成任务 (${new Date(pendingTask.timestamp).toLocaleTimeString()})，是否要恢复？`
        );
        
        if (shouldRecover) {
          // 自动恢复任务
          recoverTask(pendingTask.taskId).catch(err => {
            console.error('[useImageGeneration] 自动恢复任务失败:', err);
          });
        } else {
          // 用户选择不恢复，清除任务
          clearPendingTask(pendingTask.taskId);
        }
      }
    } catch (error) {
      console.error('[useImageGeneration] 检查未完成任务失败:', error);
    }
  }, []); // 只在组件挂载时执行一次

  // 页面加载时检查并恢复中断的任务
  useEffect(() => {
    const checkPendingTasks = () => {
      try {
        const pendingTasks = getAllPendingTasks();
        
        // 找出所有活跃中但未完成的任务
        const activeTasks = pendingTasks.filter(task => 
          [TaskStatus.PENDING, TaskStatus.PROCESSING].includes(task.status) &&
          // 任务时间在12小时内
          (Date.now() - task.timestamp < 12 * 60 * 60 * 1000)
        );
        
        if (activeTasks.length > 0) {
          console.log(`[任务恢复] 检测到 ${activeTasks.length} 个未完成的任务`);
          
          // 按时间排序，最新的任务优先恢复
          const sortedTasks = activeTasks.sort((a, b) => b.timestamp - a.timestamp);
          const latestTask = sortedTasks[0];
          
          // 提示用户是否恢复任务
          const confirmed = window.confirm(
            t('confirmRecoverTask', { defaultValue: '检测到有未完成的图像生成任务，是否恢复？' })
          );
          
          if (confirmed) {
            console.log(`[任务恢复] 用户确认恢复任务 ${latestTask.taskId}`);
            recoverTask(latestTask.taskId);
          } else {
            console.log(`[任务恢复] 用户拒绝恢复任务`);
            // 用户拒绝恢复，将任务标记为已取消
            activeTasks.forEach(task => {
              updateTaskStatus(task.taskId, TaskStatus.CANCELLED, {
                error: 'USER_CANCELLED',
                errorMessage: '用户取消了任务',
                stage: 'cancelled'
              });
            });
          }
        }
      } catch (error) {
        console.error('[任务恢复] 检查待处理任务时出错:', error);
      }
    };
    
    // 延迟几秒执行，避免与应用初始化冲突
    const timer = setTimeout(checkPendingTasks, 3000);
    return () => clearTimeout(timer);
  }, [t]);

  // 生成图片 - 调用异步API
  const generateImage = useCallback(async (options: GenerationOptions): Promise<{taskId: string} | null> => {
    const { prompt, image, style, aspectRatio, standardAspectRatio } = options;
    
    console.log('[useImageGeneration] 开始生成图片流程');
    
    // 检查是否有相同的活跃任务
    if (hasActiveIdenticalTask(options)) {
      console.log('[useImageGeneration] 检测到相同的活跃任务，跳过生成');
      notify('已有相同的生成任务正在进行中', 'info');
      return null;
    }

    // 检查用户是否已验证
    const authState = authService.getAuthState();
    if (!authState?.isAuthenticated) {
      console.log('[useImageGeneration] 用户未登录，无法生成图片', authState);
      toast("需要登录才能生成图片", { icon: '⚠️' });
      return null;
    }

    // 检查任务同步服务是否锁定了提交
    if (TaskSyncManager.hasSubmissionLock()) {
      console.log('[useImageGeneration] 全局提交锁已激活，无法提交新任务');
      toast("请等待当前任务完成", { icon: '⚠️' });
      return null;
    }

    // 设置UI状态为生成中
    setIsGenerating(true);
    setStatus('loading');
    setError(null);
    
    // 设置提交锁定
    console.log('[useImageGeneration] 所有检查通过，设置提交锁定');
    TaskSyncManager.setSubmitLock();
    
    // 生成请求ID
    const requestId = uuidv4();
    
    try {
      // 更新生成阶段
      updateGenerationStage('preparing', 5);
      
      // 准备参数
      await new Promise(resolve => setTimeout(resolve, 500));
      updateGenerationStage('configuring', 10);
      
      // 使用配置文件中的辅助函数生成完整提示词
      const fullPrompt = style ? 
        generatePromptWithStyle(style, prompt.trim()) : 
        prompt.trim();
      
      // 检查并压缩图片
      let processedImage = image;
      if (image) {
        const estimatedSize = estimateBase64Size(image);
        console.log(`[useImageGeneration] 原始图片大小: ~${estimatedSize}KB`);
        
        if (estimatedSize > MAX_IMAGE_SIZE_KB) {
          updateGenerationStage('preparing', 7);
          processedImage = await compressImage(
            image,
            {
              maxWidth: MAX_IMAGE_WIDTH,
              maxHeight: MAX_IMAGE_HEIGHT,
              quality: DEFAULT_QUALITY
            }
          );
        }
      }
      
      // 更新生成阶段
      updateGenerationStage('sending_request', 20);
      
      // 准备API请求
      const response = await fetch('/api/generate-image-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          image: processedImage,
          style,
          aspectRatio,
          standardAspectRatio,
          requestId
        }),
        // 增加超时时间
        signal: AbortSignal.timeout(300000) // 5分钟超时
      });
      
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      const taskId = data.taskId;
      
      // 创建新的任务对象
      const task: PendingTask = {
        taskId,
        params: options,
        timestamp: Date.now(),
        status: TaskStatus.PENDING,
        lastUpdated: Date.now(),
        error: null,
        errorMessage: null,
        progress: 0,
        stage: 'initialized',
        result: null
      };
      
      savePendingTask(task);
      setCurrentTaskId(taskId);
      
      // 开始轮询任务状态
      updateGenerationStage('processing', 30);
      
      // 设置轮询取消函数
      const pollOptions: PollOptions = {
        maxAttempts: TASK_CONFIG.POLLING_MAX_ATTEMPTS,
        initialInterval: TASK_CONFIG.POLLING_INTERVAL,
        maxInterval: 10000,
        exponentialFactor: 1.5,
        failureRetries: 3,
        onProgress: (progress: number, stage: string) => {
          setGenerationPercentage(progress);
          setGenerationStage(stage as GenerationStage);
        },
        onStateChange: (state: TaskStatus) => {
          console.log(`[生成] 任务状态变更: ${state}`);
        }
      };

      enhancedPollTaskStatus(taskId, pollOptions);
      
      return { taskId };
    } catch (error) {
      console.error('[useImageGeneration] 生成图片失败:', error);
      
      // 不再重新发起请求,而是继续保持当前状态
      if (currentTaskId) {
        console.log('[useImageGeneration] 前端发生错误,但保持任务继续进行');
        // 不更改任何UI状态,让任务继续进行
        return { taskId: currentTaskId };
      }
      
      // 如果没有currentTaskId,说明任务还未创建成功
      setError(error instanceof Error ? error.message : '生成失败');
      setStatus('error');
      setIsGenerating(false); // 设置生成状态为false
      notify('创建任务失败,请重试', 'error');
      
      return null;
    } finally {
      // 释放提交锁定
      TaskSyncManager.setSubmitLock();
    }
  }, [handlePollingResult]);

  // 增强版的恢复任务函数，添加网络故障处理
  const recoverTask = useCallback(async (taskId: string): Promise<boolean> => {
    let taskInfo: PendingTask | null = null;
    
    try {
      const task = getPendingTask(taskId);
      if (!task) {
        notify(`任务 ${taskId} 不存在`, 'error');
        return false;
      }
      
      // 保存任务信息到外部变量，使其在 catch 块中也可访问
      taskInfo = task;
      
      // 检查是否与已有任务重复
      if (checkDuplicateSubmission(taskInfo.params)) {
        toast.error(t('duplicateTaskRecovery', { defaultValue: '相同参数的任务已经在处理中，无需重复恢复' }));
        return false;
      }
      
      console.log(`[任务恢复] 开始恢复任务 ${taskId}`);
      
      setIsGenerating(true);
      setCurrentTaskId(taskInfo.taskId);
      setError(null);
      
      // 更新状态为恢复中
      updateTaskStatus(taskInfo.taskId, TaskStatus.PROCESSING, {
        stage: 'recovering',
        progress: 0
      });
      
      // 查询当前任务状态
      const statusResponse = await fetch(`/api/image-task-status/${taskInfo.taskId}`);
      console.log(`[任务恢复] 当前任务状态:`, statusResponse);
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        
        // 如果任务已完成或失败，直接处理结果
        if ([TaskStatus.COMPLETED, TaskStatus.FAILED].includes(statusData.status)) {
          console.log(`[任务恢复] 任务已${statusData.status === TaskStatus.COMPLETED ? '完成' : '失败'}`);
          
          // 使用前面定义的轮询结果处理函数
          handlePollingResult(statusData, taskInfo.taskId);
          
          setIsGenerating(false);
          return true;
        }
      }
      
      // 如果任务仍在进行中，开始轮询状态
      console.log(`[任务恢复] 任务仍在进行中，开始轮询状态`);
      toast.success(t('taskRecovering', { defaultValue: '正在恢复任务...' }));
      
      // 开始轮询任务状态
      const pollingResult = await enhancedPollTaskStatus(taskId, {
        maxAttempts: 180,         // 最多尝试180次 (约15分钟，视间隔而定)
        initialInterval: 2000,    // 初始间隔2秒
        maxInterval: 10000,       // 最大间隔10秒
        exponentialFactor: 1.5,   // 指数增长因子
        failureRetries: 0,        // 连续失败不重试
        onProgress: (progress, stage) => {
          console.log(`[任务恢复] 状态更新: ${progress}%, 阶段: ${stage}`);
          // 更新本地存储中的任务状态
          updateTaskStatus(taskInfo!.taskId, TaskStatus.PROCESSING, {
            stage: stage as string,
            progress: progress
          });
        }
      });
      
      // 处理轮询结果
      handlePollingResult(pollingResult, taskInfo!.taskId);
      
      return true;
    } catch (error: any) {
      console.error('[任务恢复] 恢复任务时出错:', error);
      setError(error.message || t('recoveryFailed', { defaultValue: '恢复任务失败' }));
      toast.error(error.message || t('recoveryFailed', { defaultValue: '恢复任务失败' }));
      
      // 错误时也标记任务状态
      if (taskInfo?.taskId) {
        updateTaskStatus(taskInfo.taskId, TaskStatus.FAILED);
      }
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [handlePollingResult, t]);

  // 放弃任务
  const discardTask = (taskId: string): void => {
    clearPendingTask(taskId);
    notify('已放弃任务', 'info');
  };

  /**
   * 检查当前提交是否与已有的任务重复
   * @param params 当前请求参数
   * @returns true 如果是重复提交，false 如果不是重复提交
   */
  const checkDuplicateSubmission = (params: any): boolean => {
    const pendingTasks = getAllPendingTasks();
    
    // 检查是否有相同参数的任务正在进行中
    const duplicateTask = pendingTasks.find(task => {
      // 只检查正在进行中的任务
      const isActiveTask = [TaskStatus.PENDING, TaskStatus.PROCESSING].includes(task.status);
      if (!isActiveTask) return false;
      
      // 任务开始时间在30分钟内，否则认为是过期任务
      const isRecentTask = Date.now() - task.timestamp < 30 * 60 * 1000;
      if (!isRecentTask) return false;
      
      // 检查请求参数是否相同
      return isSameRequest(task.params, params);
    });
    
    return !!duplicateTask;
  };

  // 检查是否有相同参数的活跃任务
  const hasActiveIdenticalTask = (params: Record<string, any>): boolean => {
    const currentTask = TaskSyncManager.getCurrentTask();
    if (!currentTask || !currentTask.params) return false;

    // 如果任务不是处理中状态，或者已经超过5分钟，不认为是活跃任务
    if (currentTask.status !== TaskStatus.PROCESSING || 
        Date.now() - currentTask.timestamp > 5 * 60 * 1000) {
      return false;
    }

    // 比较任务参数是否相同
    return isSameRequest(currentTask.params, params);
  };

  // 更新任务状态的函数
  const updateTaskStatus = (taskId: string, status: TaskStatus, options?: { error?: string; errorMessage?: string; progress?: number; stage?: string }) => {
    const task = getPendingTask(taskId);
    if (!task) return;

    const updatedTask: PendingTask = {
      ...task,
      status,
      lastUpdated: Date.now(),
      error: options?.error || null,
      errorMessage: options?.errorMessage || null,
      progress: options?.progress ?? task.progress,
      stage: options?.stage || task.stage
    };

    savePendingTask(updatedTask);
  };

  /**
   * 检查两个任务参数是否相同
   */
  const isSameRequest = (params1: Record<string, any>, params2: Record<string, any>): boolean => {
    if (!params1 || !params2) return false;
    
    const keys = ['prompt', 'style', 'aspectRatio', 'standardAspectRatio'];
    return keys.every(key => params1[key] === params2[key]);
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