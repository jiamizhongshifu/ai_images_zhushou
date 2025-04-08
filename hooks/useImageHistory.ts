import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cacheService, CACHE_PREFIXES } from '@/utils/cache-service';

// 缓存键和过期时间
const HISTORY_CACHE_KEY = CACHE_PREFIXES.HISTORY + ':recent';
const HISTORY_CACHE_TTL = 30 * 60 * 1000; // 提高到30分钟
// 历史记录最大数量限制
const MAX_HISTORY_RECORDS = 100;
// 分批加载的默认批次大小
const DEFAULT_BATCH_SIZE = 20;

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
  loadMore: (specificOffset?: number) => Promise<boolean>; // 更新为支持特定偏移量
  hasMore: boolean; // 新增是否有更多数据
  batchSize: number; // 新增批次大小
}

/**
 * 自定义Hook用于获取和管理图片历史记录
 * 注：支持分批加载和虚拟滚动优化
 */
export default function useImageHistory(initialBatchSize = DEFAULT_BATCH_SIZE): UseImageHistoryResult {
  const router = useRouter();
  const [historyItems, setHistoryItems] = useState<ImageHistoryItem[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isCached = useRef<boolean>(false);
  
  // 分页相关状态
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [batchSize, setBatchSize] = useState<number>(initialBatchSize);
  
  // 存储完整的历史记录数据
  const allHistoryItems = useRef<ImageHistoryItem[]>([]);

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
        return cleanUrl;
      }
      
      // 3. 检查URL是否包含http协议
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
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
        console.error('URL格式无效:', cleanUrl);
        return null;
      }
    } catch (error) {
      console.error('验证URL过程中出错:', url);
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
      
      // 重置分页状态
      setOffset(0);
      setHasMore(true);
      
      // 使用缓存服务获取数据
      const historyData = await cacheService.getOrFetch(
        HISTORY_CACHE_KEY,
        async () => {
          // 首次加载只获取一批数据
          const response = await fetch(`/api/history/get?limit=${batchSize}&offset=0`, {
            headers: { 
              'Cache-Control': 'no-cache',
              'X-Requested-With': 'XMLHttpRequest' // 防止重复请求
            }
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
        console.log(`[useImageHistory] 获取到历史记录数据: ${historyData.history.length} 条 ${isCached.current ? '(来自缓存)' : '(来自API)'}`);
        
        if (!Array.isArray(historyData.history)) {
          console.error('[useImageHistory] 历史记录不是数组格式:', historyData.history);
          setError('历史记录格式错误');
          setIsLoading(false);
          return;
        }
        
        // 检查是否还有更多数据
        setHasMore(historyData.history.length >= batchSize);
        
        // 更新offset
        setOffset(prev => prev + historyData.history.length);
        
        if (historyData.history.length === 0) {
          console.log('[useImageHistory] 历史记录为空');
          setHistoryItems([]);
          setImages([]);
          setError(null);
          allHistoryItems.current = [];
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
        
        // 保存完整数据
        allHistoryItems.current = validImages;
        
        // 更新历史记录状态
        setHistoryItems(validImages);
        
        // 确保有历史记录时更新生成图片状态
        if (validImages.length > 0) {
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
          
          // 设置生成图片状态
          setImages(uniqueUrls);
          console.log('[历史钩子] 成功设置历史图片到展示区');
          
          // 预加载第一批图片（最多5张）
          uniqueUrls.slice(0, 5).forEach(url => {
            const img = new Image();
            img.src = url;
          });
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
            
            allHistoryItems.current = validImages;
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
      // 设置加载结束状态
      if (showLoading) {
        setIsLoading(false);
      }
      console.log('[useImageHistory] 历史记录加载完成');
    }
  }, [router, validateImageUrl, batchSize]);

  // 加载更多历史记录
  const loadMore = useCallback(async (specificOffset?: number): Promise<boolean> => {
    if (!hasMore && !specificOffset) return false;
    
    try {
      console.log(`[useImageHistory] 加载更多历史记录，当前偏移量: ${specificOffset !== undefined ? specificOffset : offset}`);
      setIsLoading(true);
      
      // 使用指定的偏移量或当前存储的偏移量
      const currentOffset = specificOffset !== undefined ? specificOffset : offset;
      
      // 使用IndexedDB缓存检查是否有后续批次的缓存
      const cacheKey = `${HISTORY_CACHE_KEY}:offset_${currentOffset}`;
      const historyData = await cacheService.getOrFetch(
        cacheKey,
        async () => {
          console.log(`[useImageHistory] 发起API请求获取更多历史, limit=${batchSize}, offset=${currentOffset}`);
          const response = await fetch(`/api/history/get?limit=${batchSize}&offset=${currentOffset}`, {
            headers: { 
              'Cache-Control': 'no-cache',
              'X-Requested-With': 'XMLHttpRequest',
              'X-Request-Time': new Date().getTime().toString() // 添加时间戳防止缓存
            }
          });
          
          if (!response.ok) {
            throw new Error(`获取更多历史记录失败: HTTP ${response.status}`);
          }
          
          return await response.json();
        },
        {
          expiresIn: HISTORY_CACHE_TTL,
          forceRefresh: true // 强制刷新，确保获取最新数据
        }
      );
      
      if (historyData.success && Array.isArray(historyData.history)) {
        console.log(`[useImageHistory] 加载更多历史记录成功，获取${historyData.history.length}条`,
          historyData.history.map((i: any) => i.id).join(','));
        
        // 检查是否还有更多数据
        const newHasMore = historyData.history.length >= batchSize;
        console.log(`[useImageHistory] 是否还有更多数据: ${newHasMore}`);
        setHasMore(newHasMore);
        
        // 更新偏移量 - 仅当未指定特定偏移量时才更新
        if (specificOffset === undefined) {
          const newOffset = offset + historyData.history.length;
          console.log(`[useImageHistory] 更新偏移量: ${offset} -> ${newOffset}`);
          setOffset(newOffset);
        }
        
        if (historyData.history.length === 0) {
          console.log(`[useImageHistory] 没有更多历史记录`);
          setIsLoading(false);
          return false;
        }
        
        // 处理新加载的数据
        const validImages = historyData.history
          .filter((item: any) => item && item.image_url)
          .map((item: any) => ({
            ...item,
            image_url: validateImageUrl(item.image_url)
          }))
          .filter((item: any) => item.image_url);
        
        console.log(`[useImageHistory] 处理后的有效图片: ${validImages.length}条`);
        
        // 根据是否指定了特定偏移量决定如何合并数据
        if (specificOffset !== undefined && specificOffset !== offset) {
          // 对于特定页面加载，我们需要在正确的位置插入数据
          const existingIds = new Set(allHistoryItems.current.map((item: ImageHistoryItem) => item.id));
          const newItems = validImages.filter((item: ImageHistoryItem) => !existingIds.has(item.id));
          
          if (newItems.length > 0) {
            // 创建一个新数组，确保长度足够
            const newAllHistoryItems = [...allHistoryItems.current];
            // 确保数组长度足够
            while (newAllHistoryItems.length <= specificOffset + newItems.length) {
              newAllHistoryItems.push(null as any);
            }
            
            // 在指定位置插入新项
            for (let i = 0; i < newItems.length; i++) {
              newAllHistoryItems[specificOffset + i] = newItems[i];
            }
            
            // 过滤掉null并更新存储
            const filteredItems = newAllHistoryItems.filter(item => item !== null) as ImageHistoryItem[];
            allHistoryItems.current = filteredItems;
            setHistoryItems(filteredItems);
            
            // 更新图片URL数组
            const imageUrls = filteredItems.map((item: ImageHistoryItem) => item.image_url);
            const uniqueUrls = Array.from(new Set(imageUrls));
            setImages(uniqueUrls);
          }
        } else {
          // 标准的合并新旧数据
          const combinedHistoryItems = [...allHistoryItems.current, ...validImages];
          
          // 检查去重，避免重复项
          const uniqueHistoryItems = Array.from(
            new Map(combinedHistoryItems.map(item => [item.id, item])).values()
          );
          console.log(`[useImageHistory] 合并后的历史记录: ${uniqueHistoryItems.length}条`);
          
          // 更新引用数据
          allHistoryItems.current = uniqueHistoryItems;
          
          // 更新状态
          setHistoryItems(uniqueHistoryItems);
          
          // 更新图片URL数组
          if (validImages.length > 0) {
            const newImageUrls = validImages.map((item: any) => item.image_url);
            console.log(`[useImageHistory] 新增图片URL: ${newImageUrls.length}个`);
            
            setImages(prev => {
              const combined = [...prev, ...newImageUrls];
              // 确保URL唯一
              const uniqueUrls = Array.from(new Set(combined));
              console.log(`[useImageHistory] 更新后的图片总数: ${uniqueUrls.length}个`);
              return uniqueUrls;
            });
            
            // 预加载新加载的图片（最多5张）
            newImageUrls.slice(0, 5).forEach((url: string) => {
              const img = new Image();
              img.src = url;
            });
          }
        }
        
        setIsLoading(false);
        return true;
      } else {
        console.error('[useImageHistory] 加载更多历史记录失败:', historyData.error || '未知错误');
        setHasMore(false);
        setIsLoading(false);
        return false;
      }
    } catch (error) {
      console.error('[useImageHistory] 加载更多历史记录出错:', error);
      setHasMore(false);
      setIsLoading(false);
      return false;
    }
  }, [hasMore, isLoading, offset, batchSize, validateImageUrl]);

  // 删除图片
  const deleteImage = useCallback(async (imageUrl: string): Promise<void> => {
    try {
      console.log('[useImageHistory] 删除图片:', imageUrl);
      
      // 先从本地状态移除
      const newHistoryItems = allHistoryItems.current.filter(item => item.image_url !== imageUrl);
      allHistoryItems.current = newHistoryItems;
      setHistoryItems(newHistoryItems);
      setImages(prev => prev.filter(url => url !== imageUrl));
      
      // 调用API删除
      const response = await fetch('/api/history/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl }),
      });
      
      if (!response.ok) {
        throw new Error(`删除图片失败: HTTP ${response.status}`);
      }
      
      // 删除缓存
      cacheService.delete(HISTORY_CACHE_KEY);
      // 删除所有分页缓存
      for (let i = 0; i < offset; i += batchSize) {
        cacheService.delete(`${HISTORY_CACHE_KEY}:offset_${i}`);
      }
      
      console.log('[useImageHistory] 删除图片成功');
    } catch (error) {
      console.error('[useImageHistory] 删除图片失败:', error);
      // 恢复删除前的状态 - 可选
      await fetchImageHistory(true, false);
      throw error;
    }
  }, [batchSize, fetchImageHistory, offset]);

  // 初始加载
  useEffect(() => {
    fetchImageHistory(false, true);
  }, [fetchImageHistory]);

  return {
    images,
    historyItems,
    isLoading,
    error,
    isCached: isCached.current,
    refetch: fetchImageHistory,
    deleteImage,
    loadMore,
    hasMore,
    batchSize
  };
} 