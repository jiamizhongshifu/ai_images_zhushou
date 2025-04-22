"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { authService } from "@/utils/auth-service";
import { Button } from '@/components/ui/button';
import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { useUserState } from '@/app/components/providers/user-state-provider';

export default function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading, refreshUserState } = useUserState();
  const [showAccessButton, setShowAccessButton] = useState(false);
  const [sessionRetryCount, setSessionRetryCount] = useState(0);
  const [isManuallyCheckingSession, setIsManuallyCheckingSession] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  const hasAuthSession = searchParams?.has('auth_session');
  const hasLoginSuccess = searchParams?.has('login_success');
  const sessionCreated = searchParams?.get('session_created');
  
  // 检查cookie中的认证标记
  useEffect(() => {
    // 检查cookie中是否有认证标记
    const cookieHasAuth = document.cookie.includes('auth_valid=true');
    
    if (cookieHasAuth && !isAuthenticated) {
      console.log('[ProtectedLayout] 从cookie检测到认证标记，主动刷新用户状态');
      refreshUserState();
    }
    
    // 如果有OAuth登录成功标记，主动强制刷新用户状态
    if (hasLoginSuccess) {
      console.log('[ProtectedLayout] 检测到OAuth登录成功标记，主动强制刷新');
      // 先通过一个API请求确认会话状态
      fetch('/api/auth/status', {
        method: 'GET',
        credentials: 'include'
      })
      .then(response => {
        if (response.ok) {
          console.log('[ProtectedLayout] 会话状态API确认成功');
          refreshUserState();
          // 移除URL中的登录参数，但保留在同一页面
          const url = new URL(window.location.href);
          url.searchParams.delete('login_success');
          url.searchParams.delete('session_created');
          window.history.replaceState({}, '', url.toString());
        } else {
          console.warn('[ProtectedLayout] 会话状态API确认失败');
        }
      })
      .catch(error => {
        console.error('[ProtectedLayout] 会话状态API请求错误:', error);
      });
    }
  }, [hasLoginSuccess, isAuthenticated, refreshUserState]);

  // 添加超时机制，防止永久加载
  useEffect(() => {
    if ((authLoading || isManuallyCheckingSession) && !loadingTimeout) {
      const timer = setTimeout(() => {
        console.log('[ProtectedLayout] 加载超时，尝试直接验证会话');
        setLoadingTimeout(true);
        
        // 尝试通过API直接验证会话
        fetch('/api/auth/incognito-session', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        .then(async response => {
          if (response.ok) {
            const data = await response.json();
            console.log('[ProtectedLayout] API会话验证成功:', data);
            window.location.href = '/protected'; // 刷新页面
          } else {
            console.log('[ProtectedLayout] API会话验证失败，跳转到登录页');
            router.push('/sign-in');
          }
        })
        .catch(error => {
          console.error('[ProtectedLayout] API会话验证出错:', error);
          router.push('/sign-in');
        });
      }, 10000); // 10秒超时
      
      return () => clearTimeout(timer);
    }
  }, [authLoading, isManuallyCheckingSession, loadingTimeout, router]);
  
  useEffect(() => {
    if (hasAuthSession && !isAuthenticated && sessionRetryCount < 3) {
      setIsManuallyCheckingSession(true);
      
      console.log(`[ProtectedLayout] 检测到auth_session参数，等待会话建立(重试${sessionRetryCount + 1}/3)`);
      
      const timeoutId = setTimeout(async () => {
        try {
          await authService.forceSyncAuthState();
          
          const hasCookieAuth = document.cookie.includes('user_authenticated=true');
          
          if (hasCookieAuth) {
            console.log('[ProtectedLayout] Cookie中发现认证标记，尝试刷新页面');
            window.location.href = '/protected';
            return;
          }
          
          setSessionRetryCount(prev => prev + 1);
          setIsManuallyCheckingSession(false);
        } catch (error) {
          console.error('[ProtectedLayout] 会话验证失败:', error);
          setSessionRetryCount(prev => prev + 1);
          setIsManuallyCheckingSession(false);
        }
      }, 1500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [hasAuthSession, isAuthenticated, sessionRetryCount]);

  useEffect(() => {
    if (sessionRetryCount >= 3 && hasAuthSession && !isAuthenticated) {
      console.log('[ProtectedLayout] 会话建立重试次数已达上限，尝试最后的恢复方式');
      
      fetch('/api/auth/incognito-session', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(response => {
        if (response.ok) {
          console.log('[ProtectedLayout] 通过API恢复会话成功，刷新页面');
          window.location.href = '/protected';
        } else {
          console.log('[ProtectedLayout] 无法恢复会话，显示登录按钮');
          setShowAccessButton(true);
        }
      })
      .catch(error => {
        console.error('[ProtectedLayout] 恢复会话请求失败:', error);
        setShowAccessButton(true);
      });
    }
  }, [sessionRetryCount, hasAuthSession, isAuthenticated]);

  // 在ProtectedLayout组件中添加一个新的useEffect处理本地存储访问错误
  useEffect(() => {
    // 捕获全局未处理的错误，特别是本地存储访问错误
    function handleError(event: ErrorEvent) {
      if (event.error && event.error.message && 
          event.error.message.includes('Access to storage is not allowed')) {
        console.error('[ProtectedLayout] 检测到存储访问错误:', event.error);
        
        // 设置标记cookie
        document.cookie = 'storage_limitation=true; path=/; max-age=3600; SameSite=Lax';
        
        // 检查cookie中是否已有认证标记
        const cookieHasAuth = document.cookie.includes('auth_valid=true');
        
        if (cookieHasAuth) {
          console.log('[ProtectedLayout] 尽管有存储错误，但从cookie检测到认证标记');
          // 不重定向，刷新当前页面状态
          refreshUserState();
          return;
        }
        
        // 如果尚未开始API验证，则直接启动
        if (!loadingTimeout) {
          console.log('[ProtectedLayout] 由于存储访问错误，立即尝试API验证');
          setLoadingTimeout(true);
          
          // 尝试通过API直接验证会话
          fetch('/api/auth/incognito-session', {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          })
          .then(async response => {
            if (response.ok) {
              const data = await response.json();
              console.log('[ProtectedLayout] API会话验证成功:', data);
              window.location.href = '/protected'; // 刷新页面
            } else {
              console.log('[ProtectedLayout] API会话验证失败，跳转到登录页');
              router.push('/sign-in');
            }
          })
          .catch(error => {
            console.error('[ProtectedLayout] API会话验证出错:', error);
            router.push('/sign-in');
          });
        }
      }
    }
    
    window.addEventListener('error', handleError);
    
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, [loadingTimeout, router, refreshUserState]);

  // 如果加载中状态超时且API验证也在进行中，显示特殊提示
  if (loadingTimeout) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
          <p className="mt-4 text-lg">正在通过API验证会话...</p>
          <p className="text-sm text-muted-foreground">如果长时间未响应，请<Button variant="link" onClick={() => router.push('/sign-in')} className="p-0 h-auto font-normal">返回登录</Button></p>
        </div>
      </div>
    );
  }

  if (authLoading || isManuallyCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
          <p className="mt-4 text-lg">加载中...</p>
          {hasAuthSession && <p className="text-sm text-muted-foreground">正在验证会话 ({sessionRetryCount}/3)</p>}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (!hasAuthSession || sessionRetryCount >= 3) {
      redirect('/sign-in');
    }
  }

  if (showAccessButton) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">需要登录</h1>
          <p className="text-gray-600 mt-2">您需要登录才能访问此页面</p>
        </div>
        <Button onClick={() => router.push('/sign-in')} className="px-6 py-2">
          登录账户
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
          {children}
      </main>
    </div>
  );
} 