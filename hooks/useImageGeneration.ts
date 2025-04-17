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
import { authService } from '@/utils/auth-service';
import logger from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { showNotification } from '@/utils/notification';
import { validateSessionWithRetry } from '@/utils/session-validator';

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
  
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const pollingCancelRef = useRef<() => void>(() => {});

  const { triggerCreditRefresh } = useUserState();
  const submissionLockRef = useRef<boolean>(false);
  const lastSubmitTimeRef = useRef<number>(0);

  const { t } = useTranslation('image');
  const router = useRouter();

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
      
      // 刷新其他数据
      cacheService.delete(USER_CREDITS_CACHE_KEY);
      cacheService.delete(HISTORY_CACHE_KEY);
      if (triggerCreditRefresh) triggerCreditRefresh();
      if (refreshHistory) refreshHistory();
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

  // 生成图片 - 调用异步API
  const generateImage = useCallback(async (options: GenerationOptions): Promise<{taskId: string} | null> => {
    const { prompt, image, style, aspectRatio, standardAspectRatio } = options;
    
    console.log('[useImageGeneration] 开始生成图片流程');
    
    // 尝试清除可能存在的登出标记
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('force_logged_out');
        localStorage.removeItem('logged_out');
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('isLoggedOut');
      }
      if (typeof document !== 'undefined') {
        document.cookie = 'force_logged_out=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'logged_out=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
    } catch (e) {
      console.warn('[useImageGeneration] 清除登出标记失败:', e);
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
    // 使用sessionStorage存储最近的请求ID和时间戳
    try {
      if (typeof sessionStorage !== 'undefined') {
        const lastRequestData = sessionStorage.getItem('last_image_request');
        if (lastRequestData) {
          const lastRequest = JSON.parse(lastRequestData);
          const timeSinceLastRequest = Date.now() - lastRequest.timestamp;
          
          // 如果5秒内有相同参数的请求，阻止重复提交
          if (timeSinceLastRequest < 5000 && isSameRequest(lastRequest.params, options)) {
            logger.warn(`[任务重复] 检测到5秒内重复提交，拒绝新请求`);
            console.log(`[任务重复] 检测到5秒内重复提交，拒绝新请求，间隔: ${timeSinceLastRequest}ms`);
            toast("请勿频繁提交相同请求", { icon: '⚠️' });
            return null;
          }
        }
        
        // 记录当前请求
        sessionStorage.setItem('last_image_request', JSON.stringify({
          id: requestId,
          timestamp: Date.now(),
          params: options
        }));
      }
    } catch (e) {
      console.warn('[useImageGeneration] 检查或记录最近请求失败:', e);
    }

    // 检查是否有重复任务
    const tasks = getAllPendingTasks();
    if (tasks.length > 0 && !options.forced) {
      const duplicateTask = tasks.find(task => {
        return isSameRequest(task.params, options);
      });

      if (duplicateTask) {
        logger.warn(`[任务重复] 发现重复任务，当前已有${tasks.length}个活跃任务`);
        console.log(`[任务重复] 检测到重复参数：${JSON.stringify(options)}, 当前已有${tasks.length}个任务`);
        toast("相似任务正在处理中", { icon: '⚠️' });
        return null;
      }
    }

    // 检查提交频率
    if (!options.forced && lastSubmitTimeRef.current) {
      const now = Date.now();
      const diff = now - lastSubmitTimeRef.current;
      if (diff < 2000) { // 2秒内不能重复提交，改为2秒，更严格的控制
        logger.warn(`[任务重复] 提交过于频繁，间隔 ${diff}ms`);
        console.log(`[任务重复] 提交过于频繁：上次 ${lastSubmitTimeRef.current}, 当前 ${now}, 间隔 ${diff}ms`);
        toast("请勿频繁提交", { icon: '⚠️' });
        return null;
      }
    }
    
    // 检查提交时间间隔 
    const now = Date.now();
    if (now - lastSubmitTimeRef.current < SUBMIT_LOCK_TIMEOUT) {
      console.log('[useImageGeneration] 提交过于频繁，拒绝请求');
      console.log(`[useImageGeneration] 上次提交时间: ${new Date(lastSubmitTimeRef.current).toISOString()}, 当前时间: ${new Date(now).toISOString()}`);
      notify(`操作太频繁，请等待${Math.ceil(SUBMIT_LOCK_TIMEOUT/1000)}秒后再试`, 'info');
      return null;
    }
    
    // 验证参数
    if (!prompt.trim() && !image && (!style || style === '自定义')) {
      console.log('[useImageGeneration] 参数验证失败，拒绝请求');
      setError("请输入提示词，或上传图片并选择艺术风格");
      return null;
    }
    
    // 所有条件检查通过后，才设置提交锁定
    console.log('[useImageGeneration] 所有检查通过，设置提交锁定');
    TaskSyncManager.setSubmitLock();
    lastSubmitTimeRef.current = now;
    
    // 检查是否有未完成的相同任务
    const pendingTask = checkPendingTask();
    if (pendingTask && isSameRequest(pendingTask, options)) {
      console.log(`[useImageGeneration] 检测到未完成的相同任务: ${pendingTask.taskId}`);
      notify("继续处理之前的相同请求...", 'info');
      
      // 更新时间戳
      lastSubmitTimeRef.current = now;
      
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
      
      // 记录到跨标签页同步管理器
      TaskSyncManager.recordTask({
        taskId: pendingTask.taskId,
        timestamp: Date.now(),
        status: 'processing',
        params: options
      });
      
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

            // 第一步：如果尺寸过大，先调整分辨率
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = image;
            });

            let finalMaxWidth = MAX_IMAGE_WIDTH;
            let finalMaxHeight = MAX_IMAGE_HEIGHT;
            
            // 如果图片尺寸超过限制，按比例缩小
            if (img.width > MAX_IMAGE_WIDTH || img.height > MAX_IMAGE_HEIGHT) {
              const ratio = Math.min(MAX_IMAGE_WIDTH / img.width, MAX_IMAGE_HEIGHT / img.height);
              finalMaxWidth = Math.round(img.width * ratio);
              finalMaxHeight = Math.round(img.height * ratio);
            }

            // 压缩图片
            processedImage = await compressImage(
              image,
              {
                maxWidth: finalMaxWidth,
                maxHeight: finalMaxHeight,
                quality: targetQuality
              }
            );
            
            const newSize = estimateBase64Size(processedImage);
            console.log(`[useImageGeneration] 压缩完成，新大小: ~${newSize}KB (压缩率: ${(newSize/estimatedSize*100).toFixed(1)}%)`);
            
            // 如果压缩后仍然超过限制，但已经是最低质量，继续使用
            if (newSize > MAX_IMAGE_SIZE