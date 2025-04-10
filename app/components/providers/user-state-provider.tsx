"use client";

import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { authService } from '@/utils/auth-service';
import { creditService } from '@/utils/credit-service';
import { limitRequest, REQUEST_KEYS } from '@/utils/request-limiter';

// 定义上下文类型
interface UserStateContextType {
  credits: number | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUserState: (options?: { showLoading?: boolean; forceRefresh?: boolean }) => Promise<void>;
  triggerCreditRefresh: () => Promise<void>;
}

// 创建上下文
const UserStateContext = createContext<UserStateContextType>({
  credits: null,
  isLoading: false,
  isAuthenticated: false,
  refreshUserState: async () => {},
  triggerCreditRefresh: async () => {},
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
      // 强制同步认证状态，确保使用最新状态
      try {
        const { forceSyncAuthState } = await import('@/utils/auth-service');
        forceSyncAuthState();
      } catch (e) {
        console.warn('[UserStateProvider] 强制同步认证状态失败:', e);
      }
      
      // 重新检查认证状态
      const currentAuthState = authService.isAuthenticated();
      setIsAuthenticated(currentAuthState);
      
      if (!currentAuthState) {
        console.log('[UserStateProvider] 用户未认证，跳过获取积分');
        setCredits(null);
        return;
      }
      
      // 防止短时间内多次重复调用 - 放在认证检查之后
      const now = Date.now();
      if (!forceRefresh && (refreshingRef.current || now - lastFetchTime < 30000)) { // 使用30秒冷却时间
        console.log('[UserStateProvider] 跳过短时间内的重复请求 (冷却中)');
        return;
      }
      
      // 标记开始刷新
      refreshingRef.current = true;
      if (showLoading) {
        setLoadingWithTimeout(true);
      }
      
      // 直接调用API获取积分 - 使用 limitRequest 包装
      console.log('[UserStateProvider] 调用 limitRequest 获取用户积分，强制刷新:', forceRefresh);
      const fetchedCredits = await limitRequest(
        REQUEST_KEYS.CREDITS,
        async () => {
          const response = await fetch(`/api/credits/get?_t=${Date.now()}`, { // 强制无缓存
            method: 'GET',
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            },
            credentials: 'include'
          });
          
          if (!response.ok) {
            throw new Error(`API 请求失败: ${response.status}`);
          }
          
          const data = await response.json();
          if (data.success && typeof data.credits === 'number') {
            return data.credits;
          } else {
            throw new Error('API 返回无效数据');
          }
        },
        30000, // 与 limitRequest 默认值一致
        forceRefresh
      );

      // 更新状态
      setCredits(fetchedCredits);
      setLastFetchTime(Date.now());
      console.log(`[UserStateProvider] 成功获取用户积分: ${fetchedCredits}`);
      
      // --- 移除缓存和后备逻辑 ---
      // try {
      //   // 检查缓存...
      // } catch (apiError) {
      //   // 备用逻辑...
      // }
    } catch (error) {
      // 处理 limitRequest 抛出的冷却错误
      if ((error as Error).message.includes('冷却时间内')) {
        console.log('[UserStateProvider] 获取积分请求在冷却中，使用当前值');
      } else {
        console.error('[UserStateProvider] 获取用户状态失败:', error);
        // 出错时不改变现有积分，除非是第一次加载且失败
        if (credits === null && isInitializing) {
          setCredits(0); // 首次加载失败给个默认值
        }
      }
    } finally {
      if (showLoading) {
        setLoadingWithTimeout(false);
      }
      // 确保刷新状态被重置
      refreshingRef.current = false;
      
      // 确保初始化状态结束
      if (isInitializing) {
        setIsInitializing(false);
      }
    }
  }, [lastFetchTime, credits, isInitializing]);
  
  // 新增：强制刷新积分的触发器函数
  const triggerCreditRefresh = useCallback(async () => {
    console.log('[UserStateProvider] 触发强制积分刷新');
    await refreshUserState({ forceRefresh: true, showLoading: true });
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
        
        // 先更新认证状态
        const previousAuthState = isAuthenticated;
        setIsAuthenticated(authState.isAuthenticated);
        
        if (authState.isAuthenticated && !previousAuthState) {
          // 从 未认证 -> 已认证 (登录)
          console.log('[UserStateProvider] 用户已认证，强制获取积分');
          // 强制刷新积分
          refreshUserState({ forceRefresh: true, showLoading: true });
        } else if (!authState.isAuthenticated && previousAuthState) {
          // 从 已认证 -> 未认证 (登出)
          console.log('[UserStateProvider] 用户未认证，清空积分');
          setCredits(null);
        }
        // 其他情况（状态未变或应用加载初期）忽略
        
      }, 300); // 300ms防抖
    });
    
    // 初始检查
    const initialCheck = async () => {
      if (initialCheckDoneRef.current) {
        console.log('[UserStateProvider] 初始检查已完成，跳过');
        return;
      }
      
      try {
        // 强制同步一下，确保初始状态准确
        const { forceSyncAuthState } = await import('@/utils/auth-service');
        forceSyncAuthState();
      } catch (e) { /* ignore */ }
      
      const currentAuthState = authService.isAuthenticated();
      console.log('[UserStateProvider] 初始认证状态检查:', currentAuthState ? '已登录' : '未登录');
      
      setIsAuthenticated(currentAuthState);
      
      if (currentAuthState) {
        try {
          console.log('[UserStateProvider] 初始化时用户已认证，获取数据 (非强制)');
          // 初始加载使用非强制刷新，利用冷却机制
          await refreshUserState({ forceRefresh: false, showLoading: true });
        } catch (error) {
          console.error('[UserStateProvider] 初始加载出错:', error);
        }
      }
      
      // 初始加载完成
      setIsInitializing(false);
      initialCheckDoneRef.current = true;
    };
    
    initialCheck();
    
    return () => {
      unsubscribe();
      if (authChangeDebounceRef.current) {
        clearTimeout(authChangeDebounceRef.current);
      }
      
      // ... 清理加载定时器 ...
    };
  // 依赖项更新，加入 isAuthenticated 以响应状态变化
  }, [refreshUserState, credits, isInitializing, isAuthenticated]); 
  
  // 提供上下文值
  const contextValue: UserStateContextType = {
    credits,
    isLoading: isLoading || isInitializing,
    isAuthenticated,
    refreshUserState,
    triggerCreditRefresh, // 提供新的触发器函数
  };
  
  return (
    <UserStateContext.Provider value={contextValue}>
      {children}
    </UserStateContext.Provider>
  );
} 