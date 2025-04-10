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
  
  const supabase = createClient();

  // 统一获取用户信息和积分的方法
  const refreshUserState = useCallback(async (options?: { showLoading?: boolean; forceRefresh?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    const forceRefresh = options?.forceRefresh ?? false;
    
    try {
      // 防止短时间内多次重复调用
      const now = Date.now();
      if (!forceRefresh && (refreshingRef.current || now - lastFetchTime < 2000)) {
        console.log('[UserStateProvider] 跳过短时间内的重复请求');
        return;
      }
      
      refreshingRef.current = true;
      
      if (showLoading) {
        setIsLoading(true);
      }
      
      // 检查认证状态
      const currentAuthState = authService.isAuthenticated();
      setIsAuthenticated(currentAuthState);
      
      if (!currentAuthState) {
        console.log('[UserStateProvider] 用户未认证，跳过获取积分');
        setCredits(null);
        if (showLoading) setIsLoading(false);
        refreshingRef.current = false;
        return;
      }
      
      // 使用creditService获取积分
      console.log('[UserStateProvider] 获取用户积分，强制刷新:', forceRefresh);
      const userCredits = await creditService.fetchCredits(forceRefresh);
      
      setCredits(userCredits);
      setLastFetchTime(Date.now());
      
      console.log(`[UserStateProvider] 成功获取用户积分: ${userCredits}`);
    } catch (error) {
      console.error('[UserStateProvider] 获取用户状态失败:', error);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
      // 设置延时，避免频繁重复请求
      setTimeout(() => {
        refreshingRef.current = false;
      }, 300);
    }
  }, [lastFetchTime]);
  
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
    }, 2500);
    
    return () => {
      unsubscribe();
      if (authChangeDebounceRef.current) {
        clearTimeout(authChangeDebounceRef.current);
      }
      clearTimeout(delayedCheck);
    };
  }, [refreshUserState, credits]);
  
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