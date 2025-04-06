import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cacheService, CACHE_PREFIXES } from '@/utils/cache-service';

// 缓存键和过期时间
const USER_CREDITS_CACHE_KEY = CACHE_PREFIXES.USER_CREDITS + ':main';
const CREDITS_CACHE_TTL = 5 * 60 * 1000; // 5分钟

export interface UseUserCreditsResult {
  credits: number | null;
  isLoading: boolean;
  error: string | null;
  isCached: boolean;
  refetch: (showLoading?: boolean, forceRefresh?: boolean) => Promise<void>;
}

/**
 * 自定义Hook用于获取和管理用户点数
 */
export default function useUserCredits(): UseUserCreditsResult {
  const router = useRouter();
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isCached = useRef<boolean>(false);

  // 获取用户点数的方法
  const fetchUserCredits = async (showLoading = true, forceRefresh = false) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      
      // 使用缓存服务获取数据
      const creditsData = await cacheService.getOrFetch(
        USER_CREDITS_CACHE_KEY,
        async () => {
          const response = await fetch('/api/credits/get', {
            headers: { 'Cache-Control': 'no-cache' }
          });
          
          if (!response.ok) {
            if (response.status === 401) {
              router.push('/sign-in');
              throw new Error('未授权，请登录');
            }
            throw new Error(`获取点数失败: HTTP ${response.status}`);
          }
          
          return await response.json().catch(err => {
            console.error('[useUserCredits] 解析点数响应失败:', err);
            return { success: false, error: '解析响应数据失败' };
          });
        },
        {
          expiresIn: CREDITS_CACHE_TTL,
          forceRefresh
        }
      );
      
      // 记录数据来源
      isCached.current = !forceRefresh && cacheService.checkStatus(USER_CREDITS_CACHE_KEY) !== 'none';
      
      if (creditsData.success) {
        setCredits(creditsData.credits);
        setError(null);
        console.log(`[useUserCredits] 获取用户点数成功: ${creditsData.credits} ${isCached.current ? '(来自缓存)' : '(来自API)'}`);
      } else {
        setError(creditsData.error || '获取点数失败');
        console.error('[useUserCredits] 获取点数失败:', creditsData.error || '未知错误');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(errorMessage);
      console.error('[useUserCredits] 获取用户点数出错:', errorMessage);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  // 初始化时获取点数
  useEffect(() => {
    fetchUserCredits();
    
    // 监听缓存更新事件
    const unsubscribe = cacheService.onRefresh(USER_CREDITS_CACHE_KEY, () => {
      console.log('[useUserCredits] 检测到点数缓存更新，刷新状态');
      fetchUserCredits(false);
    });
    
    return () => {
      unsubscribe();
    };
  }, [router]);

  return {
    credits,
    isLoading,
    error,
    isCached: isCached.current,
    refetch: fetchUserCredits
  };
} 