"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cacheService, CACHE_PREFIXES } from '@/utils/cache-service';
import { toast } from 'sonner';
import { throttle } from '@/lib/utils';

// 缓存键和过期时间
const HISTORY_CACHE_KEY = CACHE_PREFIXES.HISTORY + ':recent';
const HISTORY_CACHE_TTL = 30 * 60 * 1000; // 提高到30分钟
// 历史记录最大数量限制
const MAX_HISTORY_RECORDS = 100;
// 分批加载的默认批次大小
const DEFAULT_BATCH_SIZE = 20;
// 请求节流时间(毫秒)
const THROTTLE_TIME = 2000; // 限制请求频率为每2秒最多一次
// 最小请求间隔(毫秒)
const MIN_REQUEST_INTERVAL = 1000; // 两次请求之间的最小间隔
// 请求锁定超时时间(毫秒)
const REQUEST_LOCK_TIMEOUT = 5000; // 请求锁定自动释放时间
// 请求去重缓存过期时间(毫秒)
const REQUEST_DEDUPE_TTL = 5000; // 去重请求缓存5秒

// 使用一个全局Map存储最近的请求，用于去重
const recentRequests = new Map<string, {timestamp: number, promise: Promise<any>}>();

// 清理过期的请求记录
function cleanupRecentRequests() {
  const now = Date.now();
  recentRequests.forEach((data, key) => {
    if (now - data.timestamp > REQUEST_DEDUPE_TTL) {
      recentRequests.delete(key);
    }
  });
}

// 定期清理过期请求记录，防止内存泄漏
if (typeof window !== 'undefined') {
  setInterval(cleanupRecentRequests, 30000); // 每30秒清理一次
}

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
  deleteImage: (imageUrlOrItem: string | ImageHistoryItem) => Promise<void>;
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
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [currentDeleteUrl, setCurrentDeleteUrl] = useState<string>('');
  const isCached = useRef<boolean>(false);
  
  // 分页相关状态
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [batchSize, setBatchSize] = useState<number>(initialBatchSize);
  
  // 存储完整的历史记录数据
  const allHistoryItems = useRef<ImageHistoryItem[]>([]);
  
  // 请求状态控制
  const isRequestPending = useRef<boolean>(false);
  const lastRequestTime = useRef<number>(0);
  
  // 跟踪组件挂载状态，避免内存泄漏
  const isMounted = useRef<boolean>(true);
  
  // 组件卸载时清理
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    }
  }, []);

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

  // 使用节流封装的获取历史数据方法
  const throttledFetchHistory = useCallback(
    throttle(async (forceRefresh = false, showLoading = true): Promise<void> => {
      // 防止重复请求 - 请求锁定机制
      if (isRequestPending.current) {
        console.log('[useImageHistory] 上一个请求仍在进行中，跳过');
        return Promise.resolve(); // 确保返回一个 Promise
      }
      
      // 检查请求时间间隔 - 防止频繁请求
      const now = Date.now();
      if (now - lastRequestTime.current < MIN_REQUEST_INTERVAL && !forceRefresh) {
        console.log(`[useImageHistory] 请求过于频繁，距上次请求仅${now - lastRequestTime.current}ms，跳过`);
        return Promise.resolve(); // 确保返回一个 Promise
      }
      
      // 去重处理：检查是否是相同参数的请求
      const requestKey = `${forceRefresh}-${showLoading}-${batchSize}`;
      
      // 如果有相同的最近请求，且未超过去重缓存时间，直接复用结果
      if (!forceRefresh && recentRequests.has(requestKey)) {
        const cachedRequest = recentRequests.get(requestKey)!;
        if (now - cachedRequest.timestamp < REQUEST_DEDUPE_TTL) {
          console.log('[useImageHistory] 使用最近相同请求的结果，避免重复请求');
          return cachedRequest.promise;
        }
      }
      
      // 更新请求状态
      isRequestPending.current = true;
      lastRequestTime.current = now;
      
      // 设置请求锁自动释放定时器，防止请求卡死
      const lockTimeoutId = setTimeout(() => {
        if (isRequestPending.current) {
          console.log('[useImageHistory] 请求锁定超时，自动释放');
          isRequestPending.current = false;
        }
      }, REQUEST_LOCK_TIMEOUT);
      
      // 创建promise并存储到去重缓存
      const fetchPromise = (async () => {
        try {
          console.log('[useImageHistory] 开始获取历史记录', forceRefresh ? '(强制刷新)' : '');
          
          // 设置加载状态
          if (showLoading && isMounted.current) {
            setIsLoading(true);
          }
          
          // 确保不是服务端渲染
          if (typeof window === 'undefined') {
            console.log('[useImageHistory] 服务端渲染，跳过获取历史记录');
            if (isMounted.current) setIsLoading(false);
            isRequestPending.current = false;
            clearTimeout(lockTimeoutId);
            return Promise.resolve();
          }
          
          // 重置分页状态
          if (forceRefresh && isMounted.current) {
            setOffset(0);
            setHasMore(true);
          }
          
          // 创建一个全局请求ID，用于追踪或取消请求
          const requestId = Math.random().toString(36).substring(2, 15);
          
          // 使用缓存服务获取数据，添加去重参数
          const historyData = await cacheService.getOrFetch(
            HISTORY_CACHE_KEY,
            async () => {
              // 添加随机参数防止浏览器缓存
              
              // 首次加载只获取一批数据
              const response = await fetch(`/api/history/get?limit=${batchSize}&offset=0&_=${requestId}`, {
                headers: { 
                  'Cache-Control': 'no-cache',
                  'X-Requested-With': 'XMLHttpRequest', // 防止重复请求
                  'X-Request-ID': requestId // 请求ID用于服务端去重
                }
              });
              
              if (!response.ok) {
                if (response.status === 401) {
                  console.log('[useImageHistory] 未授权，跳转到登录页');
                  router.push('/sign-in');
                  throw new Error('未授权，请登录');
                }
                
                // 处理429错误 - 请求过于频繁
                if (response.status === 429) {
                  try {
                    const errorData = await response.json();
                    const retryAfter = errorData.retry_after || 3; // 默认3秒后重试
                    
                    console.log(`[useImageHistory] 请求过于频繁，${retryAfter}秒后重试`);
                    toast.error(`请求过于频繁，请${retryAfter}秒后重试`);
                    
                    // 延迟稍长一点再重试
                    setTimeout(() => {
                      if (isMounted.current) {
                        console.log('[useImageHistory] 尝试重新获取历史数据');
                        isRequestPending.current = false; // 解锁请求
                      }
                    }, (retryAfter * 1000) + 500); // 增加500ms缓冲
                    
                    throw new Error(`请求频率限制，${retryAfter}秒后重试`);
                  } catch (parseError) {
                    console.error('[useImageHistory] 无法解析429响应:', parseError);
                    throw new Error('请求过于频繁，请稍后重试');
                  }
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
          
          if (!isMounted.current) {
            isRequestPending.current = false;
            clearTimeout(lockTimeoutId);
            return Promise.resolve(); // 如果组件已卸载，不再更新状态，但确保返回Promise
          }
          
          if (historyData.success) {
            console.log(`[useImageHistory] 获取到历史记录数据: ${historyData.history.length} 条 ${isCached.current ? '(来自缓存)' : '(来自API)'}`);
            
            if (!Array.isArray(historyData.history)) {
              console.error('[useImageHistory] 历史记录不是数组格式:', historyData.history);
              setError('历史记录格式错误');
              setIsLoading(false);
              isRequestPending.current = false;
              clearTimeout(lockTimeoutId);
              return Promise.resolve();
            }
            
            // 数据验证和处理
            const validHistoryItems = historyData.history.map((item: ImageHistoryItem) => {
              // 确保每个项都有必要的属性
              if (!item.id) item.id = Math.random().toString(36).substring(2, 15);
              if (!item.created_at) item.created_at = new Date().toISOString();
              
              return {
                ...item,
                // 确保image_url是安全的
                image_url: validateImageUrl(item.image_url) || '',
              };
            }).filter((item: ImageHistoryItem) => !!item.image_url);
            
            // 更新全局引用的历史数据
            allHistoryItems.current = validHistoryItems;
            
            // 更新状态
            if (isMounted.current) {
              setHistoryItems(validHistoryItems);
              setImages(validHistoryItems.map((item: ImageHistoryItem) => item.image_url));
              setOffset(validHistoryItems.length);
              setHasMore(validHistoryItems.length < (historyData.totalCount || MAX_HISTORY_RECORDS));
              setError(null);
            }
          } else {
            if (isMounted.current) {
              console.error('[useImageHistory] 获取历史记录失败:', historyData.message || '未知错误');
              setError(historyData.message || '获取历史记录失败');
            }
          }
          
          return Promise.resolve();
        } catch (error) {
          if (isMounted.current) {
            const errorMessage = error instanceof Error ? error.message : '获取历史记录失败';
            console.error('[useImageHistory] 获取历史记录出错:', errorMessage);
            setError(errorMessage);
            
            if (errorMessage.includes('未授权') || errorMessage.includes('登录')) {
              toast.error('请登录后查看历史记录');
            } else if (!errorMessage.includes('频率限制')) {
              toast.error('获取历史记录失败，请重试');
            }
          }
          return Promise.resolve(); // 即使发生错误也返回已解决的Promise
        } finally {
          if (isMounted.current) setIsLoading(false);
          
          // 清除锁定超时定时器
          clearTimeout(lockTimeoutId);
          
          // 延迟释放请求锁，避免短时间内重复请求
          setTimeout(() => {
            if (isMounted.current) {
              isRequestPending.current = false;
            }
          }, 500);
        }
      })();
      
      // 存储当前请求到去重缓存
      recentRequests.set(requestKey, {
        timestamp: now,
        promise: fetchPromise
      });
      
      return fetchPromise;
    }, THROTTLE_TIME), 
    [batchSize, router, validateImageUrl]
  );

  // 加载更多历史记录
  const loadMore = useCallback(async (specificOffset?: number): Promise<boolean> => {
    // 如果已经加载完或正在加载中，直接返回
    if (!hasMore || isLoading || isRequestPending.current) {
      return false;
    }
    
    const currentOffset = specificOffset !== undefined ? specificOffset : offset;
    console.log(`[useImageHistory] 加载更多历史记录，偏移量: ${currentOffset}, 批次大小: ${batchSize}`);
    
    // 检查请求时间间隔
    const now = Date.now();
    if (now - lastRequestTime.current < 500) {
      console.log(`[useImageHistory] 加载更多请求过于频繁，距上次请求仅${now - lastRequestTime.current}ms，跳过`);
      return false;
    }
    
    // 更新请求状态
    isRequestPending.current = true;
    lastRequestTime.current = now;
    
    try {
      // 添加随机参数防止浏览器缓存
      const requestId = Math.random().toString(36).substring(2, 15);
      
      if (isMounted.current) {
        setIsLoading(true);
      }
      
      const response = await fetch(`/api/history/get?limit=${batchSize}&offset=${currentOffset}&_=${requestId}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Request-ID': requestId
        }
      });
      
      if (!response.ok) {
        throw new Error(`加载更多历史记录失败: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!isMounted.current) {
        return false;
      }
      
      if (data.success) {
        if (!Array.isArray(data.history)) {
          console.error('[useImageHistory] 加载更多：历史记录不是数组格式', data.history);
          if (isMounted.current) {
            setError('历史记录格式错误');
            setIsLoading(false);
          }
          return false;
        }
        
        // 数据验证和处理
        const validHistoryItems = data.history.map((item: ImageHistoryItem) => {
          if (!item.id) item.id = Math.random().toString(36).substring(2, 15);
          if (!item.created_at) item.created_at = new Date().toISOString();
          
          return {
            ...item,
            image_url: validateImageUrl(item.image_url) || '',
          };
        }).filter((item: ImageHistoryItem) => !!item.image_url);
        
        // 更新状态
        if (isMounted.current) {
          setHistoryItems(prevItems => {
            // 确保不重复添加
            const existingIds = new Set(prevItems.map((item: ImageHistoryItem) => item.id));
            const uniqueNewItems = validHistoryItems.filter(
              (item: ImageHistoryItem) => !existingIds.has(item.id)
            );
            
            const mergedItems = [...prevItems, ...uniqueNewItems];
            
            // 更新全局引用
            allHistoryItems.current = mergedItems;
            
            return mergedItems;
          });
          
          setImages(prevImages => {
            const newImages = validHistoryItems
              .map((item: ImageHistoryItem) => item.image_url)
              .filter((url: string) => !prevImages.includes(url));
            
            return [...prevImages, ...newImages];
          });
          
          setOffset(prev => prev + validHistoryItems.length);
          setHasMore(validHistoryItems.length > 0);
        }
        
        return true;
      } else {
        if (isMounted.current) {
          console.error('[useImageHistory] 加载更多失败:', data.message || '未知错误');
          setError(data.message || '加载更多历史记录失败');
        }
        return false;
      }
    } catch (error) {
      if (isMounted.current) {
        const errorMessage = error instanceof Error ? error.message : '加载更多历史记录失败';
        console.error('[useImageHistory] 加载更多出错:', errorMessage);
        setError(errorMessage);
        toast.error('加载更多历史记录失败');
      }
      return false;
    } finally {
      if (isMounted.current) setIsLoading(false);
      
      // 延迟释放请求锁
      setTimeout(() => {
        isRequestPending.current = false;
      }, 300);
    }
  }, [batchSize, hasMore, isLoading, offset, validateImageUrl]);

  // 删除历史记录中的图片
  const deleteImage = useCallback(async (imageUrlOrItem: string | ImageHistoryItem): Promise<void> => {
    try {
      // 处理不同类型的参数
      let imageUrl: string;
      let targetItem: ImageHistoryItem | undefined;
      
      if (typeof imageUrlOrItem === 'string') {
        // 如果是字符串，当作图片URL处理
        imageUrl = imageUrlOrItem;
        targetItem = historyItems.find(item => item.image_url === imageUrl);
      } else if (imageUrlOrItem && typeof imageUrlOrItem === 'object') {
        // 如果是对象，当作ImageHistoryItem处理
        imageUrl = imageUrlOrItem.image_url;
        targetItem = imageUrlOrItem;
      } else {
        toast.error('请指定要删除的图片');
        return;
      }
      
      if (!imageUrl) {
        toast.error('请指定要删除的图片');
        return;
      }
      
      if (!targetItem) {
        toast.error('未找到相关历史记录');
        return;
      }
      
      setIsDeleting(true);
      setCurrentDeleteUrl(imageUrl);
      
      // 乐观更新UI
      setHistoryItems(prev => prev.filter((item: ImageHistoryItem) => item.image_url !== imageUrl));
      setImages(prev => prev.filter((url: string) => url !== imageUrl));
      
      const response = await fetch('/api/history/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: targetItem.id }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('删除图片失败:', errorData);
        toast.error('删除图片失败，请稍后重试');
        setIsDeleting(false);
        setCurrentDeleteUrl('');
        throw new Error(`删除历史记录失败: ${response.statusText}`);
      }
      
      // 更新全局引用
      allHistoryItems.current = allHistoryItems.current.filter(
        (i: ImageHistoryItem) => i.image_url !== imageUrl
      );
      
      toast.success('图片已删除');
      
      // 如果删除后列表为空且有更多数据，自动加载下一批
      if (historyItems.length <= 1 && hasMore && !isLoading) {
        setTimeout(() => {
          throttledFetchHistory(true, false);
        }, 300);
      }
    } catch (error) {
      console.error('删除图片时出错:', error);
      toast.error('删除图片失败，请稍后重试');
    } finally {
      setIsDeleting(false);
      setCurrentDeleteUrl('');
    }
  }, [historyItems, hasMore, isLoading, throttledFetchHistory]);

  // 公开的刷新方法 - 使用防抖控制频率
  const refetch = useCallback(async (forceRefresh = true, showLoading = true): Promise<void> => {
    // 检查距离上次成功刷新的时间
    const now = Date.now();
    
    // 如果只是非强制刷新，且距离上次刷新不到1秒，就跳过
    if (!forceRefresh && (now - lastRequestTime.current < 1000)) {
      console.log('[useImageHistory] 跳过非强制刷新，避免频繁请求');
      return Promise.resolve();
    }
    
    // 保持返回一个Promise以保证接口一致性
    return throttledFetchHistory(forceRefresh, showLoading);
  }, [throttledFetchHistory]);

  // 初始化加载数据
  useEffect(() => {
    console.log('[useImageHistory] 初始化历史记录');
    
    // 组件挂载时加载一次
    throttledFetchHistory(false, true);
    
    // 组件卸载时清理
    return () => {
      console.log('[useImageHistory] 组件卸载，清理资源');
      isMounted.current = false;
    };
  }, [throttledFetchHistory]);

  return {
    images,
    historyItems,
    isLoading,
    error,
    isCached: isCached.current,
    refetch,
    deleteImage,
    loadMore,
    hasMore,
    batchSize
  };
} 