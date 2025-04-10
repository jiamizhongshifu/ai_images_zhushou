"use client";

import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { authService } from '@/utils/auth-service';
import { creditService } from '@/utils/credit-service';

// 定义上下文类型
interface UserStateContextType {
  credits: number | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUserState: (options?: { showLoading?: boolean; forceRefresh?: boolean }) => Promise<void>;
}

// 创建上下文
const UserStateContext = createContext<UserStateContextType>({
  credits: null,
  isLoading: false,
  isAuthenticated: false,
  refreshUserState: async () => {},
});

// 导出使用上下文的钩子
export const useUserState = () => useContext(UserStateContext);

interface UserStateProviderProps {
  children: React.ReactNode;
}

export function UserStateProvider({ children }: UserStateProviderProps) {
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  
  // 防抖动引用和状态跟踪
  const authChangeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const refreshingRef = useRef<boolean>(false);
  const initialCheckDoneRef = useRef<boolean>(false);
  const pageReloadCheckRef = useRef<boolean>(false);
  const initialLoadTimeRef = useRef<number>(Date.now());
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const supabase = createClient();

  // 设置加载超时，确保加载状态不会卡住
  const setLoadingWithTimeout = (loading: boolean) => {
    // 清除之前的超时计时器
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    if (loading) {
      setIsLoading(true);
      // 设置新的超时计时器，确保加载状态不会无限期地保持
      loadingTimeoutRef.current = setTimeout(() => {
        console.log('[UserStateProvider] 加载超时，强制重置加载状态');
        setIsLoading(false);
      }, 10000); // 10秒后强制结束加载状态
    } else {
      setIsLoading(false);
    }
  };

  // 统一获取用户信息和积分的方法
  const refreshUserState = useCallback(async (options?: { showLoading?: boolean; forceRefresh?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    const forceRefresh = options?.forceRefresh ?? false;
    
    try {
      // 防止短时间内多次重复调用
      const now = Date.now();
      if (!forceRefresh && (refreshingRef.current || now - lastFetchTime < 5000)) {
        console.log('[UserStateProvider] 跳过短时间内的重复请求');
        return;
      }
      
      refreshingRef.current = true;
      
      if (showLoading) {
        setLoadingWithTimeout(true);
      }
      
      // 强制同步认证状态，确保使用最新状态
      try {
        // 导入方式，避免循环引用
        const { forceSyncAuthState } = await import('@/utils/auth-service');
        forceSyncAuthState();
      } catch (e) {
        console.warn('[UserStateProvider] 强制同步认证状态失败:', e);
      }
      
      // 检查认证状态
      const currentAuthState = authService.isAuthenticated();
      setIsAuthenticated(currentAuthState);
      
      if (!currentAuthState) {
        console.log('[UserStateProvider] 用户未认证，跳过获取积分');
        setCredits(null);
        if (showLoading) setLoadingWithTimeout(false);
        refreshingRef.current = false;
        return;
      }
      
      // 直接调用API获取积分，不经过creditService，使用本地缓存机制
      try {
        // 检查缓存，避免频繁请求
        const cacheKey = `credits_cache_${forceRefresh ? 'force' : 'normal'}`;
        const cachedData = sessionStorage.getItem(cacheKey);
        const cacheTime = parseInt(sessionStorage.getItem(`${cacheKey}_time`) || '0', 10);
        
        // 如果缓存有效且未强制刷新，使用缓存数据
        if (!forceRefresh && cachedData && now - cacheTime < 30000) {
          const parsedCredits = parseInt(cachedData, 10);
          if (!isNaN(parsedCredits)) {
            console.log(`[UserStateProvider] 使用缓存的积分数据: ${parsedCredits}`);
            setCredits(parsedCredits);
            setLastFetchTime(now);
            return;
          }
        }
        
        console.log('[UserStateProvider] 直接调用API获取用户积分，强制刷新:', forceRefresh);
        const response = await fetch(`/api/credits/get${forceRefresh ? '?force=1' : ''}`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && typeof data.credits === 'number') {
            // 更新状态和缓存
            setCredits(data.credits);
            setLastFetchTime(now);
            
            // 保存到会话缓存
            try {
              sessionStorage.setItem(cacheKey, data.credits.toString());
              sessionStorage.setItem(`${cacheKey}_time`, now.toString());
            } catch (e) {
              console.warn('[UserStateProvider] 保存积分到缓存失败:', e);
            }
            
            console.log(`[UserStateProvider] 成功获取用户积分: ${data.credits}`);
          } else {
            console.warn('[UserStateProvider] API返回成功但无效数据:', data);
            // 如果API返回成功但数据无效，尝试使用creditService
            const userCredits = await creditService.fetchCredits(forceRefresh);
            if (userCredits !== null) {
              setCredits(userCredits);
              setLastFetchTime(now);
              console.log(`[UserStateProvider] 通过creditService成功获取用户积分: ${userCredits}`);
            }
          }
        } else {
          console.warn('[UserStateProvider] API请求失败:', response.status);
          // 如果API请求失败，尝试使用creditService
          const userCredits = await creditService.fetchCredits(forceRefresh);
          if (userCredits !== null) {
            setCredits(userCredits);
            setLastFetchTime(now);
            console.log(`[UserStateProvider] 通过creditService成功获取用户积分: ${userCredits}`);
          }
        }
      } catch (apiError) {
        console.error('[UserStateProvider] 直接调用API获取积分失败:', apiError);
        // API调用失败时，使用creditService
        try {
          const userCredits = await creditService.fetchCredits(forceRefresh);
          if (userCredits !== null) {
            setCredits(userCredits);
            setLastFetchTime(now);
            console.log(`[UserStateProvider] 使用备用方法获取用户积分: ${userCredits}`);
          }
        } catch (fallbackError) {
          console.error('[UserStateProvider] 备用获取积分方法也失败:', fallbackError);
          // 如果之前有积分数据，保持不变；否则设置为0
          if (credits === null) {
            setCredits(0);
            console.log('[UserStateProvider] 设置默认积分为0');
          }
        }
      }
    } catch (error) {
      console.error('[UserStateProvider] 获取用户状态失败:', error);
      // 错误情况下如果之前没有积分数据，设为0确保UI能显示
      if (credits === null) {
        setCredits(0);
      }
    } finally {
      if (showLoading) {
        setLoadingWithTimeout(false);
      }
      // 设置延时，避免频繁重复请求
      setTimeout(() => {
        refreshingRef.current = false;
      }, 300);
      
      // 确保初始化状态结束
      if (isInitializing) {
        setIsInitializing(false);
      }
    }
  }, [lastFetchTime, credits, isInitializing]);
  
  // 检测页面是否刚刚重新加载
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 页面加载/重载检测逻辑
      const checkIfPageReloaded = () => {
        // 检查页面加载性能数据来确定是否是页面刚刚加载
        const navigationEntries = performance?.getEntriesByType?.('navigation') || [];
        let isReload = false;
        
        if (navigationEntries.length > 0 && 'type' in navigationEntries[0]) {
          // @ts-ignore 某些浏览器可能不支持这个属性
          isReload = navigationEntries[0].type === 'reload' || navigationEntries[0].type === 'navigate';
        } else {
          // 后备方案：如果初始加载时间很近，则认为是刷新
          isReload = Date.now() - initialLoadTimeRef.current < 3000;
        }
        
        if (isReload && !pageReloadCheckRef.current) {
          console.log('[UserStateProvider] 检测到页面刚刚加载或重载，将在延迟后刷新点数');
          pageReloadCheckRef.current = true;
          
          // 设置短暂延迟后再刷新点数，确保页面稳定
          setTimeout(() => {
            if (authService.isAuthenticated()) {
              console.log('[UserStateProvider] 页面加载后延迟刷新点数');
              refreshUserState({ forceRefresh: true });
            }
          }, 1500);
        }
      };
      
      // 当DOM完全加载后执行检查
      if (document.readyState === 'complete') {
        checkIfPageReloaded();
      } else {
        window.addEventListener('load', checkIfPageReloaded);
        return () => window.removeEventListener('load', checkIfPageReloaded);
      }
    }
  }, [refreshUserState]);
  
  // 确保加载状态不会卡住
  useEffect(() => {
    // 如果加载时间超过10秒，强制重置加载状态
    const resetLoadingTimeout = setTimeout(() => {
      if (isLoading || isInitializing) {
        console.log('[UserStateProvider] 检测到加载状态持续时间过长，强制重置');
        setIsLoading(false);
        setIsInitializing(false);
      }
    }, 10000);
    
    return () => clearTimeout(resetLoadingTimeout);
  }, [isLoading, isInitializing]);
  
  // 初始化和认证状态变化时获取数据
  useEffect(() => {
    console.log('[UserStateProvider] 设置认证状态监听器');
    
    // 监听认证状态变化
    const unsubscribe = authService.subscribe((authState) => {
      console.log('[UserStateProvider] 收到认证状态变化事件:', authState.isAuthenticated ? '已登录' : '未登录');
      
      // 清除之前的防抖定时器
      if (authChangeDebounceRef.current) {
        clearTimeout(authChangeDebounceRef.current);
      }
      
      // 设置新的防抖定时器
      authChangeDebounceRef.current = setTimeout(() => {
        console.log('[UserStateProvider] 处理认证状态变化（防抖后）:', authState.isAuthenticated ? '已登录' : '未登录');
        
        setIsAuthenticated(authState.isAuthenticated);
        
        if (authState.isAuthenticated) {
          // 认证状态变更为已登录，获取积分
          console.log('[UserStateProvider] 用户已认证，获取积分');
          refreshUserState({ forceRefresh: true });
        } else {
          // 认证状态变更为未登录，清空积分
          console.log('[UserStateProvider] 用户未认证，清空积分');
          setCredits(null);
        }
      }, 200); // 200ms防抖
    });
    
    // 初始检查
    const initialCheck = async () => {
      if (initialCheckDoneRef.current) {
        console.log('[UserStateProvider] 初始检查已完成，跳过');
        return;
      }
      
      const currentAuthState = authService.isAuthenticated();
      console.log('[UserStateProvider] 初始认证状态检查:', currentAuthState ? '已登录' : '未登录');
      
      setIsAuthenticated(currentAuthState);
      
      if (currentAuthState) {
        try {
          console.log('[UserStateProvider] 初始化时用户已认证，获取数据');
          await refreshUserState({ forceRefresh: false });
        } catch (error) {
          console.error('[UserStateProvider] 初始加载出错:', error);
        }
      }
      
      // 初始加载完成
      setIsInitializing(false);
      initialCheckDoneRef.current = true;
    };
    
    initialCheck();
    
    // 设置一个额外的延迟检查，以备页面加载后认证状态还未完全同步
    const delayedCheck = setTimeout(() => {
      if (authService.isAuthenticated() && credits === null) {
        console.log('[UserStateProvider] 执行延迟的积分检查');
        refreshUserState({ forceRefresh: true });
      }
      
      // 确保初始化状态不会卡住
      if (isInitializing) {
        console.log('[UserStateProvider] 初始化状态持续过长，强制结束');
        setIsInitializing(false);
      }
    }, 2500);
    
    return () => {
      unsubscribe();
      if (authChangeDebounceRef.current) {
        clearTimeout(authChangeDebounceRef.current);
      }
      clearTimeout(delayedCheck);
      
      // 清理加载定时器
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [refreshUserState, credits, isInitializing]);
  
  // 提供上下文值
  const contextValue: UserStateContextType = {
    credits,
    isLoading: isLoading || isInitializing,
    isAuthenticated,
    refreshUserState
  };
  
  return (
    <UserStateContext.Provider value={contextValue}>
      {children}
    </UserStateContext.Provider>
  );
} 