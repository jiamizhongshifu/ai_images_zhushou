'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

interface UserStateContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  credits: number | null;
  userInfoLoaded: boolean;
  triggerCreditRefresh: () => Promise<void>;
  refreshUserState: () => Promise<void>;
}

const UserStateContext = createContext<UserStateContextType>({
  isAuthenticated: false,
  isLoading: true,
  credits: null,
  userInfoLoaded: false,
  triggerCreditRefresh: async () => {},
  refreshUserState: async () => {},
});

export function UserStateProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [userInfoLoaded, setUserInfoLoaded] = useState(false);
  const supabase = createClient();

  const triggerCreditRefresh = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      setIsLoading(true);
      console.log('[UserStateProvider] 刷新用户积分');
      
      // 调用真实API获取点数
      const response = await fetch('/api/credits/get?force=1', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.credits !== undefined) {
        setCredits(data.credits);
        console.log('[UserStateProvider] 获取到用户积分:', data.credits);
      } else {
        console.error('[UserStateProvider] API返回格式错误:', data);
        throw new Error('API返回数据格式错误');
      }
    } catch (error) {
      console.error('[UserStateProvider] 获取用户积分失败:', error);
      // 不重置点数，保留之前的值
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const refreshUserState = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
      
      if (session) {
        await triggerCreditRefresh();
      } else {
        setCredits(null);
      }
      
      setUserInfoLoaded(true);
    } catch (error) {
      console.error('[UserStateProvider] 刷新用户状态时出错:', error);
      setIsAuthenticated(false);
      setCredits(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log('[UserStateProvider] 设置认证状态监听器');
    console.log('[UserStateProvider] 初始化时主动检查认证状态');
    refreshUserState();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const timestamp = Date.now();
      console.log(`[UserStateProvider] 收到认证状态变化事件: ${session ? '已登录' : '未登录'} 时间戳: ${timestamp}`);
      
      // 只在认证状态变化时更新
      if (isAuthenticated !== !!session) {
        console.log('[UserStateProvider] 认证状态为已登录，立即激活用户信息显示');
        setIsAuthenticated(!!session);
        
        if (session) {
          await triggerCreditRefresh();
        } else {
          setCredits(null);
        }
      }
      
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isAuthenticated, triggerCreditRefresh]);

  return (
    <UserStateContext.Provider value={{ 
      isAuthenticated, 
      isLoading, 
      credits, 
      userInfoLoaded,
      triggerCreditRefresh,
      refreshUserState 
    }}>
      {children}
    </UserStateContext.Provider>
  );
}

export function useUserState() {
  const context = useContext(UserStateContext);
  if (!context) {
    throw new Error('useUserState 必须在 UserStateProvider 内部使用');
  }
  return context;
} 