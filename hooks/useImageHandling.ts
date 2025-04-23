import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ImageCache, ImageCacheEntry, ImageBlacklist } from '../components/ui/lazy-image';

// 日志级别
const LOG_LEVEL = {
  ERROR: true,    // 错误总是显示
  WARN: false,    // 警告默认关闭
  INFO: false     // 信息默认关闭
};

// 错误遥测
const reportImageError = (imageUrl: string, retries: number, error?: Error) => {
  if (LOG_LEVEL.ERROR) {
    console.error(`[useImageHandling] 图片加载失败，已重试 ${retries} 次:`, imageUrl, error);
  }
  // 这里可以添加错误上报逻辑
};

// 日志函数
const log = {
  error: (message: string, ...args: any[]) => {
    if (LOG_LEVEL.ERROR) console.error(`[useImageHandling] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    if (LOG_LEVEL.WARN) console.warn(`[useImageHandling] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    if (LOG_LEVEL.INFO) console.log(`[useImageHandling] ${message}`, ...args);
  }
};

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
  downloadImage: (imageUrl: string, filename?: string) => Promise<void>;
  getImageUrl: (originalUrl: string) => string;
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
  const loadedImages = useRef(new Set<string>());
  
  // 获取适合展示的图片URL
  const getImageUrl = useCallback((originalUrl: string) => {
    if (!originalUrl || originalUrl === 'undefined' || originalUrl === 'null') {
      return '/images/placeholder.svg';
    }
    
    if (ImageBlacklist.has(originalUrl)) {
      log.info(`使用占位图替换已知失败的图片: ${originalUrl}`);
      return '/images/placeholder.svg';
    }
    
    return getProxyImageUrl(originalUrl);
  }, []);

  // 处理图片加载成功
  const handleImageLoad = useCallback((imageUrl: string, e?: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      // 避免重复处理
      if (loadedImages.current.has(imageUrl)) {
        return;
      }
      
      loadedImages.current.add(imageUrl);
      log.info('图片加载成功:', imageUrl);
      
      setImageLoadRetries(prev => {
        const newRetries = { ...prev };
        delete newRetries[imageUrl];
        return newRetries;
      });
      
      if (e?.target instanceof HTMLImageElement) {
        const img = e.target;
        ImageCache.add(imageUrl, {
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      }
      
      if (ImageBlacklist.has(imageUrl)) {
        ImageBlacklist.remove(imageUrl);
      }
    } catch (error) {
      log.error('处理图片加载成功事件出错:', error);
    }
  }, []);

  // 处理图片加载错误
  const handleImageError = useCallback((imageUrl: string, e?: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      // 如果已在黑名单中，不重复处理
      if (ImageBlacklist.has(imageUrl)) {
        return;
      }
      
      log.error(`图片加载失败: ${imageUrl}`);
      
      if (imageUrl.includes('openai.com')) {
        ImageBlacklist.add(imageUrl);
        reportImageError(imageUrl, 0, new Error('OpenAI图片加载失败'));
        return;
      }
      
      const currentRetries = imageLoadRetries[imageUrl] || 0;
      
      setImageLoadRetries(prev => ({
        ...prev,
        [imageUrl]: currentRetries + 1
      }));
      
      ImageCache.add(imageUrl, { error: true });
      
      const retryDelay = Math.min(1000 * Math.pow(1.5, currentRetries), 10000);
      
      if (currentRetries < maxRetries) {
        setTimeout(() => retryImage(imageUrl), retryDelay);
      } else {
        reportImageError(imageUrl, currentRetries);
        ImageBlacklist.add(imageUrl);
      }
    } catch (error) {
      log.error('处理图片加载失败时出错:', error);
    }
  }, [imageLoadRetries, maxRetries]);

  // 重试加载图片
  const retryImage = useCallback((imageUrl: string) => {
    if (ImageBlacklist.has(imageUrl)) {
      log.info(`跳过重试已知失败的图片: ${imageUrl}`);
      return;
    }
    
    log.info(`尝试重新加载图片: ${imageUrl}`);
    
    const urlToTry = imageUrl.includes('openai.com') ? getProxyImageUrl(imageUrl) : imageUrl;
    
    const tempImg = new window.Image();
    
    const timeoutId = setTimeout(() => {
      log.warn(`图片加载超时: ${imageUrl}`);
      tempImg.src = '';
      ImageBlacklist.add(imageUrl);
    }, 30000);
    
    tempImg.onload = () => {
      clearTimeout(timeoutId);
      handleImageLoad(imageUrl);
      log.info(`重新加载图片成功: ${urlToTry}`);
      
      if (urlToTry !== imageUrl) {
        document.dispatchEvent(new CustomEvent('imageProxySuccess', { 
          detail: { originalUrl: imageUrl, proxyUrl: urlToTry } 
        }));
      }
    };
    
    tempImg.onerror = () => {
      clearTimeout(timeoutId);
      log.error(`重新加载图片仍然失败: ${urlToTry}`);
      
      if (imageUrl.includes('openai.com')) {
        ImageBlacklist.add(imageUrl);
      }
    };
    
    tempImg.src = urlToTry;
  }, [handleImageLoad]);

  // 重置所有状态
  const resetRetries = useCallback(() => {
    setImageLoadRetries({});
    loadedImages.current.clear();
  }, []);

  // 下载图片 - 使用新的download-image API
  const downloadImage = useCallback(async (imageUrl: string, filename?: string) => {
    const toastId = toast.loading("正在下载图片...");
    
    try {
      if (!imageUrl) {
        throw new Error("没有有效的图片URL可下载");
      }
      
      // 检查黑名单
      if (ImageBlacklist.has(imageUrl)) {
        throw new Error("该图片已失效，无法下载");
      }
      
      // 使用代理URL下载OpenAI图片
      const urlToDownload = imageUrl.includes('openai.com') ? 
        getProxyImageUrl(imageUrl) : imageUrl;
      
      // 构建下载API URL
      const downloadUrl = `/api/download-image?url=${encodeURIComponent(urlToDownload)}${
        filename ? `&filename=${encodeURIComponent(filename)}` : ''
      }`;

      // 使用 streams 直接下载，避免内存中的额外复制
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '下载失败');
      }

      // 获取文件名
      const contentDisposition = response.headers.get('content-disposition');
      const defaultFilename = filename || `image-${Date.now()}.png`;
      const actualFilename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/["']/g, '') 
        : defaultFilename;

      // 使用浏览器原生下载能力
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(await response.blob());
      a.download = actualFilename;
      a.style.display = 'none';
      a.click();
      
      // 延迟清理 URL 对象
      setTimeout(() => window.URL.revokeObjectURL(a.href), 100);
      
      toast.success("图片下载成功", { id: toastId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '下载失败';
      toast.error(errorMessage, { id: toastId });
      throw error;
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

// 辅助函数：下载Blob
async function downloadBlob(blob: Blob, filename?: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `image-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
} 