import { useState, useCallback } from 'react';

export interface UseImageHandlingResult {
  imageLoadRetries: {[key: string]: number};
  handleImageLoad: (imageUrl: string, e?: React.SyntheticEvent<HTMLImageElement>) => void;
  handleImageError: (imageUrl: string, e?: React.SyntheticEvent<HTMLImageElement>) => void;
  retryImage: (imageUrl: string) => void;
  resetRetries: () => void;
  downloadImage: (imageUrl: string) => void;
}

/**
 * 自定义Hook用于处理图片加载、错误和重试逻辑
 * @param maxRetries 最大重试次数
 * @param retryDelay 重试间隔(毫秒)
 */
export default function useImageHandling(
  maxRetries: number = 3,
  retryDelay: number = 2000
): UseImageHandlingResult {
  const [imageLoadRetries, setImageLoadRetries] = useState<{[key: string]: number}>({});

  // 处理图片加载成功
  const handleImageLoad = useCallback((imageUrl: string, e?: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      console.log('[useImageHandling] 图片加载成功:', imageUrl);
      // 移除重试记录，清理状态
      setImageLoadRetries(prev => {
        const newRetries = { ...prev };
        delete newRetries[imageUrl];
        return newRetries;
      });
    } catch (error) {
      console.error('[useImageHandling] 处理图片加载成功事件出错:', error);
    }
  }, []);

  // 处理图片加载错误
  const handleImageError = useCallback((imageUrl: string, e?: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      console.error(`[useImageHandling] 图片加载失败: ${imageUrl}`);
      
      const currentRetries = imageLoadRetries[imageUrl] || 0;
      
      // 更新重试次数
      setImageLoadRetries(prev => ({
        ...prev,
        [imageUrl]: currentRetries + 1
      }));
      
      // 如果未超过最大重试次数，尝试重新加载
      if (currentRetries < maxRetries) {
        console.log(`[useImageHandling] 将在${retryDelay}ms后尝试第${currentRetries + 1}次重试`);
        // 延时后重试
        setTimeout(() => retryImage(imageUrl), retryDelay * (currentRetries + 1));
      } else {
        // 超过最大重试次数，显示永久失败状态
        console.error(`[useImageHandling] 图片加载失败，已达到最大重试次数: ${imageUrl}`);
      }
    } catch (error) {
      console.error('[useImageHandling] 处理图片加载失败时出错:', error);
    }
  }, [imageLoadRetries, maxRetries, retryDelay]);

  // 重试加载图片
  const retryImage = useCallback((imageUrl: string) => {
    console.log(`[useImageHandling] 尝试重新加载图片: ${imageUrl}`);
    
    // 创建一个新的Image对象来尝试预加载
    const tempImg = new window.Image();
    tempImg.src = imageUrl;
    
    // 添加加载成功处理
    tempImg.onload = () => {
      handleImageLoad(imageUrl);
      console.log(`[useImageHandling] 重新加载图片成功: ${imageUrl}`);
    };
    
    // 添加加载失败处理
    tempImg.onerror = () => {
      console.error(`[useImageHandling] 重新加载图片仍然失败: ${imageUrl}`);
    };
  }, [handleImageLoad]);

  // 重置所有重试记录
  const resetRetries = useCallback(() => {
    setImageLoadRetries({});
  }, []);

  // 下载图片
  const downloadImage = useCallback((imageUrl: string) => {
    try {
      // 在新标签页打开图片URL
      window.open(imageUrl, '_blank');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[useImageHandling] 打开图片失败:', errorMessage);
    }
  }, []);

  return {
    imageLoadRetries,
    handleImageLoad,
    handleImageError,
    retryImage,
    resetRetries,
    downloadImage
  };
} 