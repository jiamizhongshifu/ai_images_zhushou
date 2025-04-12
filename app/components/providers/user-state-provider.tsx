"use client";

import React, { createContext, useState, useEffect, useContext, useCallback, useRef, Suspense } from 'react';
import { createClient } from '@/utils/supabase/client';
import { authService } from '@/utils/auth-service';
import { creditService } from '@/utils/credit-service';
import { limitRequest, REQUEST_KEYS } from '@/utils/request-limiter';
import { useSearchParams } from 'next/navigation';

// 定义上下文类型
interface UserStateContextType {
  credits: number | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUserState: (options?: { showLoading?: boolean; forceRefresh?: boolean }) => Promise<void>;
  triggerCreditRefresh: () => Promise<void>;
  userInfoLoaded: boolean;
}

// 创建上下文
const UserStateContext = createContext<UserStateContextType>({
  credits: null,
  isLoading: false,
  isAuthenticated: false,
  refreshUserState: async () => {},
  triggerCreditRefresh: async () => {},
  userInfoLoaded: false
});

// 导出使用上下文的钩子
export const useUserState = () => useContext(UserStateContext);

// 创建一个处理搜索参数的包装组件
function SearchParamsHandler({ onLogoutState }: { onLogoutState: (isLoggedOut: boolean) => void }) {
  const searchParams = useSearchParams(); // 获取URL参数
  
  // 检查登出状态的函数
  const checkLogoutState = useCallback(() => {
    if (typeof window === 'undefined') return false;
    
    const forceLoggedOut = localStorage.getItem('force_logged_out') === 'true';
    const isLoggedOut = sessionStorage.getItem('isLoggedOut') === 'true';
    const loggedOutParam = searchParams?.get('logged_out') === 'true';
    
    return forceLoggedOut || isLoggedOut || loggedOutParam;
  }, [searchParams]);
  
  // 监听URL参数变化
  useEffect(() => {
    const isLoggedOut = checkLogoutState();
    if (isLoggedOut) {
      console.log('[SearchParamsHandler] 检测到登出状态');
      onLogoutState(true);
    }
  }, [searchParams, checkLogoutState, onLogoutState]);
  
  return null; // 这个组件不渲染任何内容
}

interface UserStateProviderProps {
  children: React.ReactNode;
}

function UserStateProviderContent({ children }: UserStateProviderProps) {
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [userInfoLoaded, setUserInfoLoaded] = useState<boolean>(false);
  const [isLoggedOut, setIsLoggedOut] = useState<boolean>(false);
  
  // 防抖动引用和状态跟踪
  const authChangeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const refreshingRef = useRef<boolean>(false);
  const initialCheckDoneRef = useRef<boolean>(false);
  const pageReloadCheckRef = useRef<boolean>(false);
  const initialLoadTimeRef = useRef<number>(Date.now());
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshThrottleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refreshCountRef = useRef<number>(0);
  
  const supabase = createClient();
  
  // 处理登出状态回调
  const handleLogoutState = useCallback((loggedOut: boolean) => {
    if (loggedOut) {
      console.log('[UserStateProvider] 收到登出状态通知，重置状态');
      setIsLoggedOut(true);
      resetState();
    }
  }, []);
  
  // 重置状态的函数
  const resetState = useCallback(() => {
    console.log('[UserStateProvider] 重置所有状态');
    setCredits(null);
    setIsAuthenticated(false);
    setUserInfoLoaded(false);
    setLastFetchTime(0);
  }, []);
  
  // 检查登出状态的函数 - 不依赖于searchParams
  const checkLogoutState = useCallback(() => {
    if (typeof window === 'undefined') return false;
    
    const forceLoggedOut = localStorage.getItem('force_logged_out') === 'true';
    const isLoggedOut = sessionStorage.getItem('isLoggedOut') === 'true';
    
    return forceLoggedOut || isLoggedOut || isLoggedOut;
  }, []);

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
    
    // 首先检查登出状态
    if (checkLogoutState() || isLoggedOut) {
      console.log('[UserStateProvider] 检测到登出状态，跳过刷新');
      resetState();
      return;
    }
    
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
      
      if (currentAuthState) {
        setUserInfoLoaded(true);
      } else {
        setUserInfoLoaded(false);
        setCredits(null);
        console.log('[UserStateProvider] 用户未认证，跳过获取积分');
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
  }, [lastFetchTime, credits, isInitializing, checkLogoutState, resetState, isLoggedOut]);
  
  // 新增：强制刷新积分的触发器函数
  const triggerCreditRefresh = useCallback(async () => {
    // 防止短时间内重复触发 - 使用更长的冷却时间
    const now = Date.now();
    const MIN_REFRESH_INTERVAL = 10000; // 增加到10秒，减少频繁刷新
    
    if (refreshingRef.current) {
      console.log('[UserStateProvider] 点数刷新操作正在进行中，跳过重复请求');
      return;
    }
    
    if (now - lastFetchTime < MIN_REFRESH_INTERVAL) {
      console.log(`[UserStateProvider] 点数刷新请求在冷却期内，跳过 (剩余 ${Math.round((MIN_REFRESH_INTERVAL - (now - lastFetchTime))/1000)}秒)`);
      return;
    }
    
    // 防止在一个生命周期内过多刷新
    refreshCountRef.current += 1;
    const MAX_REFRESH_COUNT = 3; // 减少最大刷新次数，提前终止可能的循环刷新
    
    if (refreshCountRef.current > MAX_REFRESH_COUNT) {
      console.log(`[UserStateProvider] 已达到最大刷新次数限制(${MAX_REFRESH_COUNT}次)，跳过后续刷新，等待页面刷新或用户手动操作`);
      return;
    }
    
    // 清除任何现有的刷新计时器
    if (refreshThrottleTimerRef.current) {
      clearTimeout(refreshThrottleTimerRef.current);
      refreshThrottleTimerRef.current = null;
    }
    
    // 设置节流计时器，将多个连续请求合并为一个
    refreshThrottleTimerRef.current = setTimeout(async () => {
      console.log('[UserStateProvider] 开始执行用户点数刷新 (节流后)');
      refreshingRef.current = true;
      setLoadingWithTimeout(true);
      
      try {
        // 使用强制刷新模式获取最新点数
        await refreshUserState({ showLoading: false, forceRefresh: true });
        console.log('[UserStateProvider] 积分刷新成功');
        setLastFetchTime(Date.now());
      } catch (error) {
        console.error('[UserStateProvider] 积分刷新失败:', error);
      } finally {
        // 延迟重置刷新状态，防止连续请求
        setTimeout(() => {
          refreshingRef.current = false;
          setLoadingWithTimeout(false);
        }, 800); // 增加冷却时间
      }
    }, 300); // 300ms节流延迟，合并多个快速连续请求

    console.log(`[UserStateProvider] 已安排点数刷新，这是第${refreshCountRef.current}次刷新请求`);
  }, [refreshUserState, lastFetchTime, setLoadingWithTimeout]);
  
  // 重置任务完成后的刷新计数
  const resetRefreshCount = useCallback(() => {
    refreshCountRef.current = 0;
  }, []);

  // 监听页面路由变化，重置刷新计数
  useEffect(() => {
    // 页面刷新或导航时重置刷新计数
    window.addEventListener('beforeunload', resetRefreshCount);
    
    return () => {
      window.removeEventListener('beforeunload', resetRefreshCount);
      
      // 清理任何悬挂的计时器
      if (refreshThrottleTimerRef.current) {
        clearTimeout(refreshThrottleTimerRef.current);
      }
    };
  }, [resetRefreshCount]);

  // 监听任务完成事件，只刷新一次点数，使用事件细节
  useEffect(() => {
    const handleTaskComplete = (event: Event) => {
      // 尝试获取事件详情
      const detail = (event as CustomEvent)?.detail;
      const taskId = detail?.taskId;
      
      console.log(`[UserStateProvider] 接收到任务完成事件，任务ID: ${taskId || '未知'}`);
      
      // 任务完成时，如果已经刷新过多次，则不再刷新
      if (refreshCountRef.current > 2) {
        console.log('[UserStateProvider] 任务完成，但已经多次刷新过点数，跳过此次刷新');
        return;
      }
      
      console.log('[UserStateProvider] 开始处理任务完成后的点数刷新');
      
      // 使用延迟，确保其他系统处理（如状态更新）已完成
      setTimeout(() => {
        triggerCreditRefresh();
      }, 800);
    };
    
    // 注册任务完成事件监听
    window.addEventListener('task_completed', handleTaskComplete);
    
    return () => {
      window.removeEventListener('task_completed', handleTaskComplete);
    };
  }, [triggerCreditRefresh]);
  
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
    
    // 立即检查当前认证状态并更新
    const checkCurrentAuth = async () => {
      console.log('[UserStateProvider] 初始化时主动检查认证状态');
      
      // 首先检查登出状态
      if (checkLogoutState()) {
        console.log('[UserStateProvider] 初始化时检测到登出状态，强制设置未登录状态');
        resetState();
        return;
      }
      
      try {
        const { forceSyncAuthState } = await import('@/utils/auth-service');
        // 强制同步认证状态
        forceSyncAuthState();
        
        // 获取最新认证状态
        const currentAuthState = authService.isAuthenticated();
        console.log('[UserStateProvider] 初始认证状态:', currentAuthState ? '已登录' : '未登录');
        
        // 立即更新状态
        setIsAuthenticated(currentAuthState);
        if (currentAuthState) {
          console.log('[UserStateProvider] 用户已登录，立即激活用户信息显示');
          setUserInfoLoaded(true);
        } else {
          setUserInfoLoaded(false);
        }
      } catch (e) {
        console.error('[UserStateProvider] 初始化检查认证状态出错:', e);
      }
    };
    
    // 立即执行初始检查
    checkCurrentAuth();
    
    // 监听认证状态变化
    const unsubscribe = authService.subscribe((authState) => {
      console.log('[UserStateProvider] 收到认证状态变化事件:', authState.isAuthenticated ? '已登录' : '未登录', '时间戳:', Date.now());
      
      // 检查登出状态
      if (checkLogoutState()) {
        console.log('[UserStateProvider] 检测到登出状态，忽略认证状态变化');
        resetState();
        return;
      }
      
      // 清除之前的防抖定时器
      if (authChangeDebounceRef.current) {
        clearTimeout(authChangeDebounceRef.current);
      }
      
      // 重要：立即设置基本状态，不需要等待防抖
      const prevAuth = isAuthenticated;
      setIsAuthenticated(authState.isAuthenticated);
      
      if (authState.isAuthenticated) {
        console.log('[UserStateProvider] 认证状态为已登录，立即激活用户信息显示');
        setUserInfoLoaded(true);
      } else {
        setUserInfoLoaded(false);
        setCredits(null); // 未登录时清空积分
      }
      
      // 设置新的防抖定时器 - 用于点数刷新等耗时操作
      authChangeDebounceRef.current = setTimeout(() => {
        console.log('[UserStateProvider] 处理认证状态变化（防抖后）:', authState.isAuthenticated ? '已登录' : '未登录');
        
        if (authState.isAuthenticated && !prevAuth) {
          // 从 未认证 -> 已认证 (登录)
          console.log('[UserStateProvider] 用户刚完成登录，强制获取积分');
          // 强制刷新积分
          refreshUserState({ forceRefresh: true, showLoading: true });
        } else if (!authState.isAuthenticated && prevAuth) {
          // 从 已认证 -> 未认证 (登出)
          console.log('[UserStateProvider] 用户刚完成登出，清空积分');
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
  }, [refreshUserState, credits, isInitializing, isAuthenticated, checkLogoutState, resetState]); 
  
  // 返回提供者组件
  return (
    <UserStateContext.Provider 
      value={{ 
        credits, 
        isLoading, 
        isAuthenticated, 
        refreshUserState, 
        triggerCreditRefresh,
        userInfoLoaded 
      }}
    >
      <Suspense fallback={null}>
        <SearchParamsHandler onLogoutState={handleLogoutState} />
      </Suspense>
      {children}
    </UserStateContext.Provider>
  );
}

// 导出主提供者组件
export function UserStateProvider({ children }: UserStateProviderProps) {
  return (
    <Suspense fallback={null}>
      <UserStateProviderContent>
        {children}
      </UserStateProviderContent>
    </Suspense>
  );
} 