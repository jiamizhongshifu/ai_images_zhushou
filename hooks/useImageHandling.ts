import { useState, useCallback } from 'react';
import { toast } from 'sonner';

// 新增一个代理URL生成函数
/**
 * 生成图片代理URL，解决跨域和资源限制问题
 */
function getProxyImageUrl(originalUrl: string): string {
  // 检查是否为OpenAI资源URL
  if (originalUrl.includes('openai.com') || originalUrl.includes('videos.openai.com')) {
    try {
      // 提取资源ID和类型
      const urlObj = new URL(originalUrl);
      const pathSegments = urlObj.pathname.split('/');
      const assetPath = pathSegments[pathSegments.length - 1];
      
      // 使用我们自己的代理服务获取图片
      return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}&source=openai`;
    } catch (e) {
      console.warn('[useImageHandling] 无法解析OpenAI图片URL:', e);
    }
  }
  
  // 对于其他图片URL，保持原样
  return originalUrl;
}

export interface UseImageHandlingResult {
  imageLoadRetries: {[key: string]: number};
  handleImageLoad: (imageUrl: string, e?: React.SyntheticEvent<HTMLImageElement>) => void;
  handleImageError: (imageUrl: string, e?: React.SyntheticEvent<HTMLImageElement>) => void;
  retryImage: (imageUrl: string) => void;
  resetRetries: () => void;
  downloadImage: (imageUrl: string, filename?: string) => void;
  getImageUrl: (originalUrl: string) => string; // 新增方法
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
  
  // 获取适合展示的图片URL
  const getImageUrl = useCallback((originalUrl: string) => {
    // 如果URL为空或无效，返回占位图
    if (!originalUrl || originalUrl === 'undefined' || originalUrl === 'null') {
      return '/images/placeholder.png';
    }
    
    // 为OpenAI资源URL生成代理URL
    return getProxyImageUrl(originalUrl);
  }, []);

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
      
      // 检查是否为OpenAI链接，如果是则直接使用代理尝试
      if ((imageUrl.includes('openai.com') || imageUrl.includes('videos.openai.com')) && currentRetries === 0) {
        console.log('[useImageHandling] 检测到OpenAI图片链接，尝试使用代理加载');
        const proxyUrl = getProxyImageUrl(imageUrl);
        if (proxyUrl !== imageUrl) {
          setTimeout(() => {
            // 使用代理URL重试
            console.log(`[useImageHandling] 使用代理URL重试: ${proxyUrl}`);
            // 创建一个图片元素手动尝试加载
            const img = new Image();
            img.src = proxyUrl;
            img.onload = () => {
              console.log('[useImageHandling] 通过代理成功加载图片');
              // 通知使用该图片的组件刷新
              document.dispatchEvent(new CustomEvent('imageProxySuccess', { 
                detail: { originalUrl: imageUrl, proxyUrl } 
              }));
            };
            img.onerror = () => {
              console.error('[useImageHandling] 代理加载失败，尝试常规重试');
            };
          }, retryDelay);
          return;
        }
      }
      
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
    
    // 对于OpenAI链接，尝试使用代理URL
    const urlToTry = imageUrl.includes('openai.com') ? getProxyImageUrl(imageUrl) : imageUrl;
    
    // 创建一个新的Image对象来尝试预加载
    const tempImg = new window.Image();
    tempImg.src = urlToTry;
    
    // 添加加载成功处理
    tempImg.onload = () => {
      handleImageLoad(imageUrl);
      console.log(`[useImageHandling] 重新加载图片成功: ${urlToTry}`);
      
      // 通知使用该图片的组件刷新
      if (urlToTry !== imageUrl) {
        document.dispatchEvent(new CustomEvent('imageProxySuccess', { 
          detail: { originalUrl: imageUrl, proxyUrl: urlToTry } 
        }));
      }
    };
    
    // 添加加载失败处理
    tempImg.onerror = () => {
      console.error(`[useImageHandling] 重新加载图片仍然失败: ${urlToTry}`);
    };
  }, [handleImageLoad]);

  // 重置所有重试记录
  const resetRetries = useCallback(() => {
    setImageLoadRetries({});
  }, []);

  // 下载图片 - 使用新的download-image API
  const downloadImage = useCallback((imageUrl: string, filename?: string) => {
    try {
      if (!imageUrl) {
        toast.error("没有有效的图片URL可下载");
        return;
      }
      
      // 使用代理URL下载OpenAI图片
      const urlToDownload = imageUrl.includes('openai.com') ? 
        getProxyImageUrl(imageUrl) : imageUrl;
      
      // 构建下载API URL
      let downloadUrl = `/api/download-image?url=${encodeURIComponent(urlToDownload)}`;
      
      // 如果提供了文件名，添加到URL
      if (filename) {
        const safeFilename = encodeURIComponent(filename);
        downloadUrl += `&filename=${safeFilename}`;
      }
      
      toast.promise(
        fetch(downloadUrl)
          .then(response => {
            if (!response.ok) {
              return response.json().then(err => {
                throw new Error(err.message || '下载失败');
              });
            }
            return response.blob();
          })
          .then(blob => {
            // 创建下载链接
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename || `image-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            
            // 清理
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }),
        {
          loading: "正在下载图片...",
          success: "图片下载成功",
          error: (err) => `下载失败: ${err.message}`
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[useImageHandling] 下载图片失败:', errorMessage);
      toast.error(`下载图片失败: ${errorMessage}`);
    }
  }, []);

  return {
    imageLoadRetries,
    handleImageLoad,
    handleImageError,
    retryImage,
    resetRetries,
    downloadImage,
    getImageUrl
  };
} 