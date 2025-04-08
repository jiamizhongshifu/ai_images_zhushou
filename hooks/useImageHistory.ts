import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cacheService, CACHE_PREFIXES } from '@/utils/cache-service';

// 缓存键和过期时间
const HISTORY_CACHE_KEY = CACHE_PREFIXES.HISTORY + ':recent';
const HISTORY_CACHE_TTL = 10 * 60 * 1000; // 10分钟
// 历史记录最大数量限制
const MAX_HISTORY_RECORDS = 100;

export interface ImageHistoryItem {
  id: string;
  image_url: string;
  prompt?: string;
  created_at?: string;
  style?: string;
  [key: string]: any;
}

export interface UseImageHistoryResult {
  images: string[];
  historyItems: ImageHistoryItem[];
  isLoading: boolean;
  error: string | null;
  isCached: boolean;
  refetch: (forceRefresh?: boolean, showLoading?: boolean) => Promise<void>;
  deleteImage: (imageUrl: string) => Promise<void>;
}

/**
 * 自定义Hook用于获取和管理图片历史记录
 * 注：最多显示最近的100条历史记录，超过限制的记录将被自动清理
 */
export default function useImageHistory(): UseImageHistoryResult {
  const router = useRouter();
  const [historyItems, setHistoryItems] = useState<ImageHistoryItem[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isCached = useRef<boolean>(false);

  // 增强的图片URL验证与清理
  const validateImageUrl = useCallback((url: string): string | null => {
    if (!url) return null;
    
    try {
      // 1. 清理URL中的问题
      let cleanUrl = url.trim();
      
      // 2. 检查是否是相对URL
      if (cleanUrl.startsWith('/')) {
        // 将相对URL转换为绝对URL
        cleanUrl = `${window.location.origin}${cleanUrl}`;
        console.log('转换相对URL为绝对URL:', cleanUrl);
        return cleanUrl;
      }
      
      // 3. 检查URL是否包含http协议
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        console.log('URL缺少协议，添加https://', cleanUrl);
        cleanUrl = `https://${cleanUrl}`;
      }
      
      // 4. 清理URL末尾的特殊字符和引号
      cleanUrl = cleanUrl.replace(/[.,;:!?)"']+$/, '');
      
      // 5. 移除两端的引号
      if ((cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) || 
          (cleanUrl.startsWith("'") && cleanUrl.endsWith("'"))) {
        cleanUrl = cleanUrl.slice(1, -1);
      }
      
      // 6. 特殊处理常见的图片服务源
      // filesystem.site的图片URL特殊处理
      if (cleanUrl.includes('filesystem.site')) {
        // 确保没有多余的括号
        cleanUrl = cleanUrl.replace(/\)+$/, '');
      }
      
      // 7. 验证是否为合法URL
      try {
        new URL(cleanUrl);
        return cleanUrl;
      } catch (parseError) {
        console.error('URL格式无效:', cleanUrl, parseError);
        return null;
      }
    } catch (error) {
      console.error('验证URL过程中出错:', url, error);
      return null;
    }
  }, []);

  // 获取历史记录的方法
  const fetchImageHistory = useCallback(async (forceRefresh = false, showLoading = true): Promise<void> => {
    try {
      console.log('[useImageHistory] 开始获取历史记录', forceRefresh ? '(强制刷新)' : '');
      
      // 设置加载状态
      if (showLoading) {
        setIsLoading(true);
      }
      
      // 确保不是服务端渲染
      if (typeof window === 'undefined') {
        console.log('[useImageHistory] 服务端渲染，跳过获取历史记录');
        setIsLoading(false);
        return;
      }
      
      // 使用缓存服务获取数据
      const historyData = await cacheService.getOrFetch(
        HISTORY_CACHE_KEY,
        async () => {
          // 请求参数中确保限制记录数量
          const response = await fetch(`/api/history/get?limit=${MAX_HISTORY_RECORDS}`, {
            headers: { 'Cache-Control': 'no-cache' }
          });
          
          if (!response.ok) {
            if (response.status === 401) {
              console.log('[useImageHistory] 未授权，跳转到登录页');
              router.push('/sign-in');
              throw new Error('未授权，请登录');
            }
            throw new Error(`获取历史记录失败: HTTP ${response.status}`);
          }
          
          try {
            return await response.json();
          } catch (err) {
            console.error('[useImageHistory] 解析历史记录响应失败:', err);
            throw new Error('解析响应数据失败');
          }
        },
        {
          expiresIn: HISTORY_CACHE_TTL,
          forceRefresh
        }
      );
      
      // 记录数据来源
      isCached.current = !forceRefresh && cacheService.checkStatus(HISTORY_CACHE_KEY) !== 'none';
      
      if (historyData.success) {
        // 直接打印历史记录，帮助调试
        console.log(`[useImageHistory] 获取到历史记录数据: ${historyData.history.length} 条 ${isCached.current ? '(来自缓存)' : '(来自API)'}`);
        
        if (!Array.isArray(historyData.history)) {
          console.error('[useImageHistory] 历史记录不是数组格式:', historyData.history);
          setError('历史记录格式错误');
          setIsLoading(false);
          return;
        }
        
        if (historyData.history.length === 0) {
          console.log('[useImageHistory] 历史记录为空');
          setHistoryItems([]);
          setImages([]);
          setError(null);
          setIsLoading(false);
          return;
        }
        
        // 验证并处理图片URL
        const validImages = historyData.history
          .filter((item: any) => item && item.image_url)
          .map((item: any) => ({
            ...item,
            image_url: validateImageUrl(item.image_url)
          }))
          .filter((item: any) => item.image_url); // 过滤掉无效的URL
        
        console.log('[useImageHistory] 处理后的有效图片数据:', validImages.length, '条');
        
        // 先更新历史记录状态
        setHistoryItems(validImages);
        
        // 确保有历史记录时更新生成图片状态
        if (validImages.length > 0) {
          console.log('[历史钩子] 从历史记录加载图片到展示区域');
          
          // 按创建时间排序图片，最新的在前面
          const sortedImages = [...validImages].sort((a, b) => {
            // 如果没有创建时间，默认放在末尾
            if (!a.created_at) return 1;
            if (!b.created_at) return -1;
            
            // 按时间降序排序
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          // 提取排序后的URL数组
          const imageUrls = sortedImages.map((item: any) => item.image_url);
          
          // 防止出现重复URL
          const uniqueUrls = Array.from(new Set(imageUrls)) as string[];
          console.log('[历史钩子] 处理后的唯一URL数量:', uniqueUrls.length);
          
          // 设置生成图片状态
          setImages(uniqueUrls);
          console.log('[历史钩子] 成功设置历史图片到展示区');
        } else {
          console.warn('[历史钩子] 处理后没有有效的图片URL');
        }
      } else {
        console.error('[useImageHistory] 获取历史记录失败:', historyData.error || '未知错误');
        setError(historyData.error || '获取历史记录失败');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[useImageHistory] 获取历史记录出错:', errorMessage);
      setError(errorMessage);
      
      // 尝试从缓存获取旧数据作为降级
      if (!isCached.current) {
        const cachedData = cacheService.get<{success: boolean, history: any[]}>(HISTORY_CACHE_KEY);
        if (cachedData) {
          console.log('[useImageHistory] 使用过期缓存数据作为降级');
          try {
            // 处理缓存数据
            const validImages = cachedData.history
              .filter((item: any) => item && item.image_url)
              .map((item: any) => ({
                ...item,
                image_url: validateImageUrl(item.image_url)
              }))
              .filter((item: any) => item.image_url);
            
            setHistoryItems(validImages);
            
            if (validImages.length > 0) {
              const imageUrls = validImages.map((item: any) => item.image_url);
              setImages(Array.from(new Set(imageUrls)));
            }
          } catch (cacheError) {
            console.error('[useImageHistory] 处理缓存数据出错:', cacheError);
          }
        }
      }
    } finally {
      // 短延时确保DOM更新
      setTimeout(() => {
        if (showLoading) {
          setIsLoading(false);
        }
        console.log('[useImageHistory] 历史记录加载完成');
      }, 500);
    }
  }, [router, validateImageUrl]);

  // 删除图片的方法
  const deleteImage = useCallback(async (imageUrl: string): Promise<void> => {
    try {
      // 先在本地状态中移除，提供即时反馈
      setImages(prev => prev.filter(url => url !== imageUrl));
      setHistoryItems(prev => prev.filter(item => item.image_url !== imageUrl));
      
      // 调用API删除
      const response = await fetch('/api/history/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl }),
      });
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || '删除图片失败');
      }
      
      console.log('[useImageHistory] 成功删除图片:', imageUrl);
      
      // 刷新历史记录缓存
      cacheService.delete(HISTORY_CACHE_KEY);
    } catch (error) {
      console.error('[useImageHistory] 删除图片失败:', error);
      // 不恢复UI状态，保持删除体验
    }
  }, []);

  // 初始化时获取历史记录
  useEffect(() => {
    fetchImageHistory();
    
    // 监听缓存更新事件
    const unsubscribe = cacheService.onRefresh(HISTORY_CACHE_KEY, () => {
      console.log('[useImageHistory] 检测到历史记录缓存更新，刷新状态');
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchImageHistory(false, false);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [fetchImageHistory]);

  return {
    images,
    historyItems,
    isLoading,
    error,
    isCached: isCached.current,
    refetch: fetchImageHistory,
    deleteImage
  };
} 