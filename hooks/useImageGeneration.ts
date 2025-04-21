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
  type PendingTask,
  type TaskStatus
} from '@/utils/taskRecovery';
import { enhancedPollTaskStatus } from '@/utils/taskPoller';
import { TaskSyncManager } from '@/utils/taskSync/taskSyncManager';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n/client';
import { notify } from '@/utils/notification';
import { trackPromptUsage } from '@/utils/tracking';
import { authService, refreshSession } from '@/utils/auth-service';
import logger from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { showNotification } from '@/utils/notification';
import { setTaskActive } from '@/utils/auth-resilience';

// 图片大小限制配置
const MAX_IMAGE_SIZE_KB = 6144; // 6MB
const MAX_IMAGE_WIDTH = 2500;  // 增加到2500以保持更好的质量
const MAX_IMAGE_HEIGHT = 2500; // 增加到2500以保持更好的质量
const DEFAULT_QUALITY = 0.8;

// 添加压缩质量等级
const COMPRESSION_LEVELS = [
  { maxSize: 8192, quality: 0.9 },  // 8MB -> 90%质量
  { maxSize: 6144, quality: 0.85 }, // 6MB -> 85%质量  
  { maxSize: 4096, quality: 0.8 },  // 4MB -> 80%质量
  { maxSize: 2048, quality: 0.75 }  // 2MB -> 75%质量
];

const USER_CREDITS_CACHE_KEY = CACHE_PREFIXES.USER_CREDITS + ':main';
const HISTORY_CACHE_KEY = CACHE_PREFIXES.HISTORY + ':recent';

// 添加常量配置
const SUBMIT_LOCK_TIMEOUT = 5000; // 5秒内不允许重复提交

export type GenerationStatus = 'idle' | 'generating' | 'success' | 'error';

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
  setGeneratedImages: React.Dispatch<React.SetStateAction<string[]>>;
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
  
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const pollingCancelRef = useRef<() => void>(() => {});

  const { triggerCreditRefresh } = useUserState();
  const submissionLockRef = useRef<boolean>(false);
  const lastSubmitTimeRef = useRef<number>(0);

  const { t } = useTranslation('image');
  const router = useRouter();

  // 添加初始化时清除已生成图片的逻辑
  useEffect(() => {
    console.log('[useImageGeneration] 初始化钩子，清除当前生成的图片状态');
    setGeneratedImages([]);
  }, []);

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
  const updateGenerationStage = useCallback((stage: GenerationStage, percentage: number) => {
    setGenerationStage(stage);
    setGenerationPercentage(percentage);
    
    // 同时更新本地存储中的任务状态
    if (currentTaskId) {
      const task = getPendingTask(currentTaskId);
      if (task) {
        savePendingTask({
          ...task,
          status: stage as TaskStatus,
          progress: percentage,
          lastUpdated: Date.now()
        });
      }
    }
  }, [currentTaskId]);

  // 基于等待时间动态计算显示的阶段和进度
  const calculateStageFromWaitTime = (waitTime: number): [GenerationStage, number] => {
    if (waitTime < 5) return ['preparing', 5];
    if (waitTime < 10) return ['configuring', 10];
    if (waitTime < 15) return ['sending_request', 20];
    if (waitTime < 30) return ['processing', 30 + Math.min(30, waitTime)];
    if (waitTime < 120) return ['processing', Math.min(80, 30 + waitTime / 2)];
    return ['extracting_image', Math.min(85, 60 + waitTime / 10)];
  };

  // 启动优化后的增强轮询
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
    
    // 查询任务并记录参数信息
    const task = getPendingTask(taskId);
    if (task && task.params) {
      console.log(`[useImageGeneration] 开始轮询任务 ${taskId}，比例参数:`, {
        aspectRatio: task.params.aspectRatio,
        standardAspectRatio: task.params.standardAspectRatio
      });
    }
    
    // 启动优化后的增强轮询
    enhancedPollTaskStatus(taskId, {
      maxAttempts: 200,         // 增加最大尝试次数
      initialInterval: 1000,     // 降低初始间隔到1秒
      maxInterval: 8000,         // 减少最大间隔到8秒
      exponentialFactor: 1.3,    // 减小指数增长因子，更平滑的增长
      failureRetries: 1,         // 失败后再试一次
      onProgress: (progress, stage) => {
        if (cancelled) return;
        // 更新进度更频繁，使UI更平滑
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
      
      // 主动刷新会话，确保长时间操作后不会因为会话过期而登出
      try {
        console.log('[useImageGeneration] 任务完成后主动刷新会话状态');
        await refreshSession();
      } catch (e) {
        console.warn('[useImageGeneration] 任务完成后会话刷新失败:', e);
      }
      
      // 将任务活跃状态设置为 false
      setTaskActive(false);
      
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
        
        // 记录生成的图片URL
        if (result.data?.imageUrl) {
          console.log(`[useImageGeneration] 任务完成，图片URL: ${result.data.imageUrl}`);
          
          // 添加生成的图片
          addGeneratedImage(result.data.imageUrl);
          
          // 刷新缓存，但不触发页面刷新
          cacheService.delete(USER_CREDITS_CACHE_KEY);
          cacheService.delete(HISTORY_CACHE_KEY);
          
          // 延迟刷新用户积分，避免阻塞UI更新
          if (triggerCreditRefresh) {
            setTimeout(() => {
              // 调用没有参数的刷新方法
              triggerCreditRefresh();
            }, 300);
          }
          
          // 调用成功回调，正确传递图片URL到上层组件进行处理
          if (onSuccess) {
            // 使用setTimeout确保UI先更新，再执行回调
            setTimeout(() => {
              onSuccess(result.data.imageUrl);
            }, 10);
          }
          
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
      updateTaskStatus(taskId, 'failed', error.error || '图像生成失败');
      
      // 显示错误通知
      notify(`生成失败: ${error.error || '未知错误'}`, 'error');
    });
  };

  // 处理轮询结果的函数
  const handlePollingResult = useCallback((result: any, taskId: string) => {
    if (result.status === 'completed' && result.data?.imageUrl) {
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
      
      // 刷新缓存，不触发完整刷新
      cacheService.delete(USER_CREDITS_CACHE_KEY);
      cacheService.delete(HISTORY_CACHE_KEY);
      
      // 只刷新用户积分，不触发页面刷新
      if (triggerCreditRefresh) {
        // 使用setTimeout延迟触发，避免阻塞UI更新
        setTimeout(() => {
          triggerCreditRefresh();
        }, 300);
      }
      
      // 调用成功回调，让外部处理图片展示
      if (onSuccess) {
        onSuccess(result.data.imageUrl);
      }
    } else if (result.status === 'failed' || result.status === 'error') {
      // 更新失败状态
      setIsGenerating(false);
      setStatus('error');
      setCurrentTaskId(null);
      updateGenerationStage('failed', 0);
      setError(result.error || '图像生成失败');
      
      // 更新任务本地存储状态
      updateTaskStatus(taskId, 'failed', result.error || '图像生成失败');
      
      // 显示错误通知
      notify(`生成失败: ${result.error || '未知错误'}`, 'error');
    }
  }, [triggerCreditRefresh, onSuccess]);

  // 添加useEffect钩子来初始化任务同步监听器
  useEffect(() => {
    // 初始化任务状态同步监听
    const cleanup = TaskSyncManager.initListener({
      onTaskUpdate: (taskInfo) => {
        // 处理任务状态更新事件
        if (taskInfo.taskId === currentTaskId) {
          console.log(`[useImageGeneration] 从其他标签页接收到任务更新: ${taskInfo.taskId}, 状态: ${taskInfo.status}`);
          
          // 如果状态是完成或失败，更新本地状态
          if (taskInfo.status === 'completed') {
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
          } else if (taskInfo.status === 'failed' || taskInfo.status === 'error') {
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
        // 严格检查：确保任务没有auto_recovering标记
        if (pendingTask.auto_recovering === true) {
          console.log(`[useImageGeneration] 页面加载时检测到自动恢复中的任务: ${pendingTask.taskId}，跳过手动恢复确认`);
          return;
        }
        
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
          ['pending', 'created', 'processing'].includes(task.status) &&
          // 任务时间在12小时内
          (Date.now() - task.timestamp < 12 * 60 * 60 * 1000) &&
          // 严格检查：任务必须没有auto_recovering标记才会显示恢复对话框
          task.auto_recovering !== true
        );
        
        if (activeTasks.length > 0) {
          console.log(`[任务恢复] 检测到 ${activeTasks.length} 个未完成的任务`);
          
          // 查找所有标记为auto_recovering的任务，记录日志但不弹出恢复对话框
          const autoRecoveringTasks = pendingTasks.filter(task => 
            ['pending', 'created', 'processing'].includes(task.status) &&
            task.auto_recovering === true
          );
          
          if (autoRecoveringTasks.length > 0) {
            console.log(`[任务恢复] 发现 ${autoRecoveringTasks.length} 个自动恢复中的任务，这些任务不会触发恢复对话框`);
          }
          
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
              updateTaskStatus(task.taskId, 'cancelled');
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

  // 添加初始化时的任务状态检查
  useEffect(() => {
    const checkAndRestoreTask = () => {
      const pendingTask = checkPendingTask();
      if (pendingTask && shouldRecoverTask(pendingTask)) {
        console.log(`[useImageGeneration] 检测到未完成的任务: ${pendingTask.taskId}, 状态: ${pendingTask.status}`);
        
        // 恢复任务状态
        setCurrentTaskId(pendingTask.taskId);
        setIsGenerating(true);
        setStatus('generating' as GenerationStatus);
        
        // 根据任务状态设置生成阶段和进度
        let stage: GenerationStage = 'preparing';
        let progress = 5;
        
        switch (pendingTask.status) {
          case 'processing':
            stage = 'processing';
            progress = 60;
            break;
          case 'pending':
            stage = 'queuing';
            progress = 25;
            break;
          case 'created':
            stage = 'preparing';
            progress = 5;
            break;
          case 'recovering':
            stage = 'processing';
            progress = 40;
            break;
          default:
            stage = 'preparing';
            progress = 5;
        }

        // 如果任务有自己的进度信息，使用任务的进度
        if (typeof pendingTask.progress === 'number') {
          progress = pendingTask.progress;
        }
        
        updateGenerationStage(stage, progress);
        
        // 开始轮询任务状态
        startEnhancedPollingTaskStatus(pendingTask.taskId);
      }
    };

    // 页面加载时立即检查
    checkAndRestoreTask();
  }, []);

  // 生成图片 - 调用异步API
  const generateImage = useCallback(async (options: GenerationOptions): Promise<{taskId: string} | null> => {
    const { prompt, image, style, aspectRatio, standardAspectRatio } = options;
    
    console.log('[useImageGeneration] 开始生成图片流程');
    
    // 设置任务活跃状态为 true，防止会话变更导致登出
    setTaskActive(true);
    
    // 主动刷新会话，确保长时间操作不会导致会话过期
    try {
      console.log('[useImageGeneration] 主动刷新会话状态');
      await refreshSession();
    } catch (e) {
      console.warn('[useImageGeneration] 会话刷新失败，但继续生成流程:', e);
    }
    
    // 检查用户是否已验证 - 使用authService直接验证
    const authState = authService.getAuthState();
    if (!authState?.isAuthenticated) {
      console.log('[useImageGeneration] 用户未登录，无法生成图片', authState);
      toast("需要登录才能生成图片", { icon: '⚠️' });
      return null;
    }

    // 检查任务同步服务是否锁定了提交
    if (TaskSyncManager.hasSubmissionLock()) {
      logger.warn(`[任务重复] 全局提交锁已激活，无法提交新任务`);
      console.log(`[任务重复] 全局提交锁已激活，无法提交新任务`);
      toast("请等待当前任务完成", { icon: '⚠️' });
      return null;
    }

    // 生成请求ID，用于防止重复提交
    const requestId = uuidv4();
    
    // 验证参数
    if (!prompt.trim() && !image && (!style || style === '自定义')) {
      console.log('[useImageGeneration] 参数验证失败，拒绝请求');
      setError("请输入提示词，或上传图片并选择艺术风格");
      return null;
    }
    
    // 所有条件检查通过后，才设置提交锁定
    console.log('[useImageGeneration] 所有检查通过，设置提交锁定');
    TaskSyncManager.setSubmitLock();
    lastSubmitTimeRef.current = Date.now();
    
    // 开始新的任务生成流程
    setError(null);
    setIsGenerating(true);
    setStatus('generating' as GenerationStatus);
    startTimeRef.current = Date.now();
    
    // 重置进度状态
    updateGenerationStage('preparing', 5);
    
    try {
      // 准备参数阶段
      await new Promise(resolve => setTimeout(resolve, 500));
      updateGenerationStage('configuring', 10);
      
      // 使用原始提示词，不在这里添加风格和比例信息
      const basePrompt = prompt.trim();
      
      // 检查并压缩图片
      let processedImage = image;
      if (image) {
        // 估算图片大小
        const estimatedSize = estimateBase64Size(image);
        console.log(`[useImageGeneration] 原始图片大小: ~${estimatedSize}KB`);
        
        // 如果图片大于限制，进行压缩
        if (estimatedSize > MAX_IMAGE_SIZE_KB) {
          updateGenerationStage('preparing', 7);
          console.log(`[useImageGeneration] 图片超过大小限制(${MAX_IMAGE_SIZE_KB}KB)，开始压缩...`);
          
          try {
            // 确定压缩质量
            let targetQuality = DEFAULT_QUALITY;
            for (const level of COMPRESSION_LEVELS) {
              if (estimatedSize > level.maxSize) {
                targetQuality = level.quality;
                break;
              }
            }

            // 压缩图片
            processedImage = await compressImage(
              image,
              {
                maxWidth: MAX_IMAGE_WIDTH,
                maxHeight: MAX_IMAGE_HEIGHT,
                quality: targetQuality
              }
            );
            
            const newSize = estimateBase64Size(processedImage);
            console.log(`[useImageGeneration] 压缩完成，新大小: ~${newSize}KB (压缩率: ${(newSize/estimatedSize*100).toFixed(1)}%)`);
          } catch (compressError) {
            console.error('[useImageGeneration] 图片压缩失败:', compressError);
            throw new Error('图片处理失败，请重试或选择其他图片');
          }
        }
      }
      
      // 准备API请求数据
      const requestData = {
        prompt: basePrompt,
        image: processedImage || undefined,
        style: style !== "自定义" ? style : undefined,
        aspectRatio,
        standardRatio: standardAspectRatio,
        requestId
      };
      
      // 更详细的日志
      console.log('[useImageGeneration] 开始生成图片，参数详情:');
      console.log(`- 提示词: ${basePrompt.length > 100 ? basePrompt.substring(0, 100) + '...' : basePrompt}`);
      console.log(`- 风格: ${requestData.style || '(自定义)'}`);
      console.log(`- 比例: ${aspectRatio || '(默认)'} / 标准比例: ${standardAspectRatio || '(默认)'}`);
      console.log(`- 请求ID: ${requestId}`);
      
      // 记录图片信息但不输出完整base64以避免日志过大
      if (processedImage) {
        const imgPrefix = processedImage.substring(0, 30);
        const imgLength = processedImage.length;
        console.log(`- 图片数据: ${imgPrefix}... (长度: ${imgLength}字符)`);
      } else {
        console.log(`- 图片数据: 无`);
      }
      
      // 发送任务创建请求
      updateGenerationStage('sending_request', 20);
      
      // 设置请求超时
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<null>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('请求超时，但任务可能已创建'));
        }, 20000); // 20秒超时
      });
      
      try {
        // 竞争超时和实际请求
        const response = await Promise.race([
          fetch("/api/generate-image-task", {
            method: "POST", 
            headers: {
              'Content-Type': 'application/json',
              'X-Request-Id': requestId
            },
            body: JSON.stringify({ 
              prompt: basePrompt,
              image: processedImage,
              style,
              aspectRatio,
              standardRatio: standardAspectRatio
            })
          }),
          timeoutPromise
        ]).catch(fetchError => {
          // 特殊处理网络错误，但不终止流程
          console.error('[useImageGeneration] 请求网络错误:', fetchError);
          
          // 清除可能存在的超时计时器
          if (timeoutId) clearTimeout(timeoutId);
          
          // 创建临时任务ID，并保存任务信息，以便后续自动恢复
          const tempTaskId = `temp-${requestId}`;
          console.log(`[useImageGeneration] 生成临时任务ID: ${tempTaskId} 以继续处理`);
          
          setCurrentTaskId(tempTaskId);
          
          // 保存任务相关参数，添加auto_recovering标记，防止触发手动恢复
          savePendingTask({
            taskId: tempTaskId,
            params: options,
            timestamp: Date.now(),
            status: 'pending', // 使用pending替代idle
            auto_recovering: true // 添加自动恢复标记，防止触发手动确认
          });
          
          // 开始自动恢复流程
          setTimeout(async () => {
            try {
              console.log('[自动恢复] 开始自动查询最近任务');
              
              // 等待3秒，让后端有足够时间创建任务
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // 自动查询最近的任务
              const recentTasksResponse = await fetch('/api/recent-tasks?limit=1&minutes=3');
              
              if (!recentTasksResponse.ok) {
                throw new Error(`获取最近任务失败: ${recentTasksResponse.status}`);
              }
              
              const recentTasksData = await recentTasksResponse.json();
              
              if (recentTasksData.success && recentTasksData.tasks && recentTasksData.tasks.length > 0) {
                // 找到最近的任务
                const latestTask = recentTasksData.tasks[0];
                console.log(`[自动恢复] 找到最近任务: ${latestTask.taskId}`);
                
                // 从本地存储中清除临时任务
                clearPendingTask(tempTaskId);
                
                // 设置新的任务ID并保存
                setCurrentTaskId(latestTask.taskId);
                
                // 保存真实任务ID - 修改：保留auto_recovering标记
                savePendingTask({
                  taskId: latestTask.taskId,
                  params: options,
                  timestamp: Date.now(),
                  status: 'processing',
                  auto_recovering: true // 保留自动恢复标记，防止出现手动恢复提示
                });
                
                console.log(`[自动恢复] 自动恢复到真实任务ID: ${latestTask.taskId}`);
                
                // 开始轮询任务状态
                updateGenerationStage('processing', 30);
                TaskSyncManager.updateTaskStatus(latestTask.taskId, 'processing'); // 使用processing替代polling
                startEnhancedPollingTaskStatus(latestTask.taskId);
              } else {
                console.warn('[自动恢复] 未找到可恢复的最近任务');
                // 如果没有找到最近任务，回退到手动恢复
                setIsGenerating(false);
                setStatus('error');
                setError('任务创建过程中断，请重试或手动恢复');
                // 不清除临时任务，等待用户手动恢复
              }
            } catch (recoveryError) {
              console.error('[自动恢复] 自动恢复失败:', recoveryError);
              // 如果自动恢复失败，回退到手动恢复
              setIsGenerating(false);
              setStatus('error');
              setError('自动恢复失败，请手动恢复任务');
              // 不清除临时任务，等待用户手动恢复
            }
          }, 1000);
          
          // 返回null表示网络错误，但不抛出异常
          return null;
        });
        
        // 清除超时计时器
        if (timeoutId) clearTimeout(timeoutId);
        
        // 如果网络请求失败但已创建临时任务，则继续处理
        if (!response) {
          console.warn('[useImageGeneration] 创建任务请求失败，但已创建临时任务，继续处理');
          return { taskId: currentTaskId! };
        }
        
        // 检查响应状态
        if (response.status === 413) {
          throw new Error('图片尺寸过大，请使用较小的图片或降低图片质量');
        }
        
        if (response.status === 409) {
          // 处理重复提交的情况
          const data = await response.json();
          notify(data.message || "检测到重复提交，请稍后重试", 'info');
          
          // 如果服务器报告有重复任务但包含了任务ID，使用这个ID进行后续处理
          if (data.taskId) {
            console.log(`[useImageGeneration] 服务器检测到重复请求，使用已存在的任务: ${data.taskId}`);
            
            setCurrentTaskId(data.taskId);
            
            // 保存或更新任务记录
            savePendingTask({
              taskId: data.taskId,
              params: options,
              timestamp: Date.now(),
              status: 'processing'
            });
            
            // 开始轮询任务状态
            updateGenerationStage('processing', 30);
            startEnhancedPollingTaskStatus(data.taskId);
            
            return { taskId: data.taskId };
          }
          
          // 否则中止处理
          setIsGenerating(false);
          return null;
        }
        
        const data = await response.json().catch(err => {
          console.error('[useImageGeneration] 解析创建任务响应失败:', err);
          // 错误处理改进：不中断流程，而是使用之前创建的临时任务ID继续
          if (currentTaskId && currentTaskId.startsWith('temp-')) {
            console.log(`[useImageGeneration] 响应解析错误，但继续使用临时任务ID: ${currentTaskId}`);
            return { taskId: currentTaskId }; // 只返回taskId，符合之前定义的接口
          }
          return { error: '解析响应数据失败' };
        });
        
        if (!response.ok || !data.taskId) {
          // 改进错误处理：检查是否有临时任务ID可用
          if (currentTaskId && currentTaskId.startsWith('temp-')) {
            console.log(`[useImageGeneration] 响应无效，但继续使用临时任务ID: ${currentTaskId}`);
            return { taskId: currentTaskId }; // 只返回taskId
          }
          throw new Error(data.error || `创建图像任务失败: HTTP ${response.status}`);
        }
        
        // 保存任务ID
        const taskId = data.taskId;
        setCurrentTaskId(taskId);

        // 检查是否为重复请求
        if (data.status === 'duplicate') {
          console.log(`[useImageGeneration] 服务器检测到重复请求，使用已存在的任务: ${taskId}`);
          notify("服务器检测到相同请求正在处理中，继续使用已存在任务", 'info');
          
          // 检查本地是否已有相同任务
          const localTask = getPendingTask(taskId);
          if (!localTask) {
            // 本地没有记录，创建新的记录
            savePendingTask({
              taskId,
              params: options,
              timestamp: Date.now(), // 使用当前时间
              status: 'processing'
            });
          }
        } else {
          console.log(`[useImageGeneration] 创建任务成功，任务ID: ${taskId}`);
          
          // 保存任务到本地存储
          savePendingTask({
            taskId,
            params: options,
            timestamp: Date.now(),
            status: 'processing'
          });
        }
        
        // 开始轮询任务状态
        updateGenerationStage('processing', 30);
        startEnhancedPollingTaskStatus(taskId);
        
        // 记录到跨标签页同步管理器
        TaskSyncManager.recordTask({
          taskId,
          timestamp: Date.now(),
          status: 'processing',
          params: options
        });
        
        return { taskId }; // 返回任务ID以支持外部状态监听
      } catch (fetchError) {
        // 特殊处理AbortError（超时）
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error('[useImageGeneration] 请求超时:', fetchError);
          throw new Error('请求超时，请稍后重试');
        }
        
        // 重新抛出其他错误
        console.error('[useImageGeneration] 请求失败:', fetchError);
        throw fetchError;
      }
    } catch (err) {
      // 处理错误
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useImageGeneration] 生成图片失败:', errorMessage);
      
      // 更新状态
      setError(errorMessage);
      
      // 关键修改：不自动清除生成状态，保持骨架图显示
      // 如果已有任务ID，说明请求已发送给后端，不需要中断流程
      if (currentTaskId) {
        console.log(`[useImageGeneration] 前端错误但保持任务${currentTaskId}继续，不中断UI`);
        // 标记任务状态为有错误但继续
        updateTaskStatus(currentTaskId, 'processing', errorMessage);
        
        // 只更新错误状态，但不清除生成中状态
        setStatus('error');
        
        // 延迟再次检查任务状态
        setTimeout(() => {
          console.log(`[useImageGeneration] 延迟检查任务${currentTaskId}状态`);
          if (currentTaskId && isGenerating) {
            startEnhancedPollingTaskStatus(currentTaskId);
          }
        }, 5000);
        
        return { taskId: currentTaskId };
      } else {
        // 如果没有任务ID，说明请求根本没有成功发送，此时才完全中断流程
        setIsGenerating(false);
        setStatus('error');
        updateGenerationStage('failed', 0);
        
        // 设置任务活跃状态为 false
        setTaskActive(false);
      }
      
      // 显示错误通知，但不中断
      notify(`生成失败: ${errorMessage}，但后台任务可能仍在继续`, 'error');
      
      return null;
    } finally {
      // 不需要手动释放锁定，TaskSyncManager会自动处理锁超时
    }
  }, [router, t, authService]);

  // 增强版的恢复任务函数，添加网络故障处理
  const recoverTask = useCallback(async (taskId: string): Promise<boolean> => {
    let taskInfo: PendingTask | null = null;
    
    try {
      const task = getPendingTask(taskId);
      if (!task) {
        notify(`任务 ${taskId} 不存在`, 'error');
        return false;
      }
      
      // 如果任务正在自动恢复中，直接返回成功，避免重复恢复
      if (task.auto_recovering) {
        console.log(`[任务恢复] 任务 ${taskId} 正在自动恢复中，跳过手动恢复`);
        return true;
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
      updateTaskStatus(taskInfo.taskId, 'recovering');
      
      // 检查任务ID是否是临时ID
      if (taskId.startsWith('temp-')) {
        // 尝试获取真实任务ID
        try {
          const lastTaskResp = await fetch(`/api/last-task-for-user`);
          if (!lastTaskResp.ok) {
            throw new Error(`获取最近任务失败: ${lastTaskResp.statusText}`);
          }
          
          const lastTaskData = await lastTaskResp.json();
          
          if (lastTaskData && lastTaskData.taskId) {
            console.log(`[任务恢复] 将临时任务ID ${taskId} 映射到真实任务ID: ${lastTaskData.taskId}`);
            
            // 更新任务ID
            clearPendingTask(taskId);
            taskInfo.taskId = lastTaskData.taskId;
            savePendingTask(taskInfo);
            
            // 更新当前任务ID
            setCurrentTaskId(lastTaskData.taskId);
            
            // 使用新任务ID
            taskId = lastTaskData.taskId;
          }
        } catch (err) {
          console.warn(`[任务恢复] 无法将临时任务ID映射到真实任务ID: ${err}`);
          // 继续使用临时任务ID
        }
      }
      
      // 查询当前任务状态
      try {
        // 尝试使用任务最终状态检查API
        const finalCheckResp = await fetch(`/api/task-final-check/${taskId}`);
        
        if (finalCheckResp.ok) {
          const statusData = await finalCheckResp.json();
          
          // 如果任务已完成或失败，直接处理结果
          if (['completed', 'failed'].includes(statusData.status)) {
            console.log(`[任务恢复] 任务已${statusData.status === 'completed' ? '完成' : '失败'}`);
            
            // 使用轮询结果处理函数
            handlePollingResult(statusData, taskId);
            
            setIsGenerating(false);
            return true;
          }
        }
      } catch (err) {
        console.warn(`[任务恢复] 使用最终状态检查API失败: ${err}`);
        // 回退到常规任务状态API
      }
      
      // 如果最终状态检查失败，尝试常规任务状态API
      const statusResponse = await fetch(`/api/image-task-status/${taskId}`);
      console.log(`[任务恢复] 当前任务状态:`, statusResponse);
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        
        // 如果任务已完成或失败，直接处理结果
        if (['completed', 'failed'].includes(statusData.status)) {
          console.log(`[任务恢复] 任务已${statusData.status === 'completed' ? '完成' : '失败'}`);
          
          // 使用前面定义的轮询结果处理函数
          handlePollingResult(statusData, taskId);
          
          setIsGenerating(false);
          return true;
        }
      }
      
      // 如果任务仍在进行中，开始轮询状态
      console.log(`[任务恢复] 任务仍在进行中，开始轮询状态`);
      toast.success(t('taskRecovering', { defaultValue: '正在恢复任务...' }));
      
      // 开始轮询任务状态
      startEnhancedPollingTaskStatus(taskId);
      return true;
      
    } catch (error: any) {
      console.error('[任务恢复] 恢复任务时出错:', error);
      setError(error.message || t('recoveryFailed', { defaultValue: '恢复任务失败' }));
      toast.error(error.message || t('recoveryFailed', { defaultValue: '恢复任务失败' }));
      
      // 错误时也标记任务状态
      if (taskInfo?.taskId) {
        updateTaskStatus(taskInfo.taskId, 'error', error.message);
      }
      
      // 即使出错也尝试启动轮询
      if (taskInfo?.taskId && isTaskActive(taskInfo)) {
        setTimeout(() => {
          console.log(`[任务恢复] 虽然恢复出错，但仍尝试轮询任务状态: ${taskInfo?.taskId}`);
          startEnhancedPollingTaskStatus(taskInfo!.taskId);
        }, 5000); // 5秒后重试
      }
      
      return false;
    } finally {
      // 不要在这里设置setIsGenerating(false)，因为轮询过程需要保持生成状态
    }
  }, [handlePollingResult, t, isGenerating]);

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
      const isActiveTask = ['pending', 'created', 'processing'].includes(task.status);
      if (!isActiveTask) return false;
      
      // 任务开始时间在30分钟内，否则认为是过期任务
      const isRecentTask = Date.now() - task.timestamp < 30 * 60 * 1000;
      if (!isRecentTask) return false;
      
      // 检查请求参数是否相同
      return isSameRequest(task, params);
    });
    
    return !!duplicateTask;
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