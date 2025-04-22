'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SupabaseClient, User, Session } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { useRouter } from 'next/navigation';

interface UserStateContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  session: Session | null;
  refreshUserState: () => Promise<void>;
}

const UserStateContext = createContext<UserStateContextType>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  session: null,
  refreshUserState: async () => {},
});

export function UserStateProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const router = useRouter();
  const supabaseClient = supabase as SupabaseClient<Database>;

  const refreshUserState = useCallback(async () => {
    try {
      console.log('[UserStateProvider] 刷新用户状态...');
      
      const { data: { session: currentSession }, error } = await supabaseClient.auth.getSession();
      
      if (error) {
        console.error('[UserStateProvider] 获取会话出错:', error);
        setIsAuthenticated(false);
        setUser(null);
        setSession(null);
        
        if (!window.location.pathname.includes('/sign-in')) {
          router.push('/sign-in');
        }
        return;
      }

      if (currentSession?.user) {
        console.log('[UserStateProvider] 发现有效会话，用户:', currentSession.user.email);
        setIsAuthenticated(true);
        setUser(currentSession.user);
        setSession(currentSession);
        
        // 如果在登录页面且已认证，重定向到主页
        if (window.location.pathname.includes('/sign-in')) {
          console.log('[UserStateProvider] 用户已登录，重定向到主页');
          router.push('/');
        }
      } else {
        console.log('[UserStateProvider] 未找到有效会话');
        setIsAuthenticated(false);
        setUser(null);
        setSession(null);
        
        // 检查本地存储标记
        const hasLocalAuthFlag = localStorage.getItem('user_authenticated') === 'true';
        const hasCookieAuthFlag = document.cookie.includes('user_authenticated=true');
        
        if (hasLocalAuthFlag || hasCookieAuthFlag) {
          console.log('[UserStateProvider] 发现本地认证标记，尝试恢复会话');
          
          try {
            // 尝试调用服务器端恢复 API
            const response = await fetch('/api/auth/incognito-session', {
              method: 'GET',
              credentials: 'include',
              headers: {
                'Cache-Control': 'no-cache'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              if (data.status === 'success') {
                console.log('[UserStateProvider] 成功恢复会话');
                setIsAuthenticated(true);
                setUser(data.user);
                setSession(data.session);
                return;
              }
            }
          } catch (error) {
            console.error('[UserStateProvider] 恢复会话失败:', error);
          }
        }
        
        if (!window.location.pathname.includes('/sign-in')) {
          console.log('[UserStateProvider] 用户未登录，重定向到登录页');
          router.push('/sign-in');
        }
      }
    } catch (error) {
      console.error('[UserStateProvider] 刷新用户状态时出错:', error);
      setIsAuthenticated(false);
      setUser(null);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [router, supabaseClient]);

  useEffect(() => {
    console.log('[UserStateProvider] 组件挂载，初始化认证状态...');
    refreshUserState();

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('[UserStateProvider] 认证状态变化:', event, session?.user?.email);
      
      if (event === 'SIGNED_IN') {
        setIsAuthenticated(true);
        setUser(session?.user || null);
        setSession(session);
        
        // 存储认证标记
        localStorage.setItem('user_authenticated', 'true');
        document.cookie = `user_authenticated=true; path=/; max-age=86400; SameSite=Lax`;
        
        router.push('/');
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUser(null);
        setSession(null);
        
        // 清除认证标记
        localStorage.removeItem('user_authenticated');
        document.cookie = `user_authenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        
        router.push('/sign-in');
      } else if (event === 'TOKEN_REFRESHED') {
        setSession(session);
        if (session) {
          localStorage.setItem('user_authenticated', 'true');
          document.cookie = `user_authenticated=true; path=/; max-age=86400; SameSite=Lax`;
        }
      }
      
      setIsLoading(false);
    });

    return () => {
      console.log('[UserStateProvider] 清理认证状态监听器');
      subscription.unsubscribe();
    };
  }, [refreshUserState, supabaseClient.auth, router]);

  return (
    <UserStateContext.Provider value={{ 
      isAuthenticated, 
      isLoading, 
      user, 
      session,
      refreshUserState 
    }}>
      {children}
    </UserStateContext.Provider>
  );
}

export const useUserState = () => useContext(UserStateContext); 