import { useState, useRef, useEffect } from 'react';
import { generatePromptWithStyle } from '@/app/config/styles';
import { cacheService, CACHE_PREFIXES } from '@/utils/cache-service';
import { GenerationStage } from '@/components/ui/skeleton-generation';

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
  generateImage: (options: GenerationOptions) => Promise<string | null>;
  setGeneratedImages: (images: string[]) => void;
  addGeneratedImage: (imageUrl: string) => void;
  generationStage: GenerationStage;
  generationPercentage: number;
}

type NotificationCallback = (message: string, type: 'success' | 'error' | 'info') => void;

/**
 * 自定义Hook用于处理图片生成
 */
export default function useImageGeneration(
  onNotify?: NotificationCallback,
  onSuccess?: (imageUrl: string) => void,
  refreshCredits?: () => void,
  refreshHistory?: () => void
): UseImageGenerationResult {
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generationStage, setGenerationStage] = useState<GenerationStage>('preparing');
  const [generationPercentage, setGenerationPercentage] = useState<number>(0);
  
  // 使用ref存储进度更新计时器，确保可以在任何地方清除
  const processingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

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
  
  // 停止所有进度计时器
  const clearAllTimers = () => {
    if (processingTimerRef.current) {
      clearInterval(processingTimerRef.current);
      processingTimerRef.current = null;
    }
  };

  // 启动长时间处理进度跟踪
  const startLongProcessingTimer = () => {
    // 记录开始时间
    startTimeRef.current = Date.now();
    
    // 清除任何现有的计时器
    clearAllTimers();
    
    // 启动一个较长期的进度更新计时器，支持最长5分钟的API调用时间
    let processingTime = 0;
    const maxTime = 300; // 5分钟，单位秒
    
    // 设置初始AI处理阶段
    updateGenerationStage('processing', 30);
    
    // 创建并存储计时器引用
    processingTimerRef.current = setInterval(() => {
      // 计算已处理时间（秒）
      processingTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
      
      // 计算动态进度百分比，最高到85%
      // 进度会随时间缓慢增加，但永远不会自动到达完成阶段
      if (processingTime > 5) {
        const dynamicPercentage = Math.min(
          85, 
          30 + Math.floor((processingTime / maxTime) * 55)
        );
        
        // 根据处理时间调整显示的阶段
        if (processingTime > 120 && generationStage === 'processing') {
          // 超过2分钟，显示更详细的处理阶段
          updateGenerationStage('extracting_image', dynamicPercentage);
        } else if (processingTime > 30 && generationStage === 'processing') {
          // 处理中，更新进度百分比
          updateGenerationStage('processing', dynamicPercentage);
        }
        
        // 记录长时间处理
        if (processingTime % 30 === 0) { // 每30秒记录一次
          console.log(`[useImageGeneration] 长时间处理中，已用时: ${processingTime}秒`);
        }
      }
      
      // 超过最大时间后停止更新
      if (processingTime >= maxTime) {
        console.log(`[useImageGeneration] 处理超时，已达最大等待时间: ${maxTime}秒`);
        clearAllTimers();
      }
    }, 2000); // 每2秒更新一次进度
  };

  // 生成图片
  const generateImage = async (options: GenerationOptions): Promise<string | null> => {
    const { prompt, image, style, aspectRatio, standardAspectRatio } = options;
    
    if (!prompt.trim() && !image && (!style || style === '自定义')) {
      setError("请输入提示词，或上传图片并选择艺术风格");
      return null;
    }
    
    setError(null);
    setIsGenerating(true);
    setStatus('loading');
    
    // 重置进度状态并启动计时
    startTimeRef.current = Date.now();
    updateGenerationStage('preparing', 5);
    
    try {
      // 准备参数阶段
      await new Promise(resolve => setTimeout(resolve, 500));
      updateGenerationStage('configuring', 10);
      
      // 使用配置文件中的辅助函数生成完整提示词
      const fullPrompt = style ? 
        generatePromptWithStyle(style, prompt.trim()) : 
        prompt.trim();
      
      // 准备API请求数据
      const requestData = {
        prompt: fullPrompt,
        image: image || undefined,
        style: style !== "自定义" ? style : undefined,
        aspectRatio,
        standardAspectRatio
      };
      
      console.log('[useImageGeneration] 开始生成图片，参数:', {
        prompt: fullPrompt ? `${fullPrompt.slice(0, 30)}...` : '(空)',
        hasImage: !!image,
        style: requestData.style || '(自定义)',
        aspectRatio: aspectRatio || '(默认)',
        standardRatio: standardAspectRatio || '(默认)'
      });
      
      // 发送请求阶段
      updateGenerationStage('sending_request', 20);
      
      // 开始长时间处理进度跟踪
      startLongProcessingTimer();
      
      // 调用API端点生成图片
      const response = await fetch("/api/generate-image-direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });
      
      // API响应返回，清除进度计时器
      clearAllTimers();
      
      // 计算总耗时
      const totalSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
      console.log(`[useImageGeneration] API请求完成，总耗时: ${totalSeconds}秒`);
      
      // 提取图像阶段
      updateGenerationStage('extracting_image', 85);
      
      const data = await response.json().catch(err => {
        console.error('[useImageGeneration] 解析生成图片响应失败:', err);
        return { success: false, error: '解析响应数据失败' };
      });
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || `生成图片失败: HTTP ${response.status}`);
      }
      
      if (data.success && data.imageUrl) {
        // 完成处理阶段
        updateGenerationStage('finalizing', 95);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        console.log(`[useImageGeneration] 图片生成成功，URL: ${data.imageUrl}`);
        
        // 添加生成的图片到列表
        addGeneratedImage(data.imageUrl);
        
        // 重置状态
        updateGenerationStage('completed', 100);
        
        // 延迟短暂时间后重置生成状态，确保用户能看到完成动画
        setTimeout(() => {
          setIsGenerating(false);
          setStatus('success');
          setError(null);
        }, 800);
        
        // 使缓存过期，确保下次获取时刷新数据
        cacheService.delete(USER_CREDITS_CACHE_KEY);
        cacheService.delete(HISTORY_CACHE_KEY);
        
        // 调用回调函数
        if (refreshCredits) refreshCredits();
        if (refreshHistory) refreshHistory();
        if (onSuccess) onSuccess(data.imageUrl);
        
        // 显示成功通知
        notify('图片生成成功！', 'success');
        
        return data.imageUrl;
      } else {
        throw new Error(data.error || "生成图片失败，服务器返回无效响应");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[useImageGeneration] 生成图片失败:", errorMessage);
      
      // 清除所有进度计时器
      clearAllTimers();
      
      setError(errorMessage || "生成图片时发生错误");
      setStatus('error');
      setIsGenerating(false);
      updateGenerationStage('failed', 0);
      
      // 刷新点数（可能已经退还）
      if (refreshCredits) refreshCredits();
      
      // 显示错误通知
      notify(`生成失败: ${errorMessage}`, 'error');
      
      return null;
    }
  };
  
  // 组件卸载时清除计时器
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

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