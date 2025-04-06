import { useState } from 'react';
import { generatePromptWithStyle } from '@/app/config/styles';
import { cacheService, CACHE_PREFIXES } from '@/utils/cache-service';

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
    
    try {
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
      
      // 调用API端点生成图片
      const response = await fetch("/api/generate-image-direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });
      
      const data = await response.json().catch(err => {
        console.error('[useImageGeneration] 解析生成图片响应失败:', err);
        return { success: false, error: '解析响应数据失败' };
      });
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || `生成图片失败: HTTP ${response.status}`);
      }
      
      if (data.success && data.imageUrl) {
        console.log(`[useImageGeneration] 图片生成成功，URL: ${data.imageUrl}`);
        
        // 添加生成的图片到列表
        addGeneratedImage(data.imageUrl);
        
        // 重置状态
        setIsGenerating(false);
        setStatus('success');
        setError(null);
        
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
      setError(errorMessage || "生成图片时发生错误");
      setStatus('error');
      setIsGenerating(false);
      
      // 刷新点数（可能已经退还）
      if (refreshCredits) refreshCredits();
      
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
    addGeneratedImage
  };
} 