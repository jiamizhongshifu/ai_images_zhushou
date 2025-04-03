"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { User, LogOut, LogIn } from 'lucide-react';
import UserCreditDisplay from '@/components/user-credit-display';

export default function UserNav() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [forceShowUser, setForceShowUser] = useState(false); // 强制显示用户状态的标志
  const supabase = createClient();
  
  useEffect(() => {
    async function getUser() {
      try {
        console.log('[UserNav] 开始获取用户信息');
        
        // 首先检查localStorage中是否有认证标记
        const localAuth = localStorage.getItem('auth_valid');
        if (localAuth === 'true') {
          console.log('[UserNav] 本地存储中发现认证标记，尝试强制显示用户界面');
          setForceShowUser(true);
        }
        
        // 检查cookie是否存在
        const hasSBCookie = document.cookie.includes('sb-access-token') || 
                           document.cookie.includes('sb-refresh-token');
        if (hasSBCookie) {
          console.log('[UserNav] 检测到认证cookie存在');
        } else {
          console.log('[UserNav] 未检测到认证cookie');
        }
        
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          console.error('[UserNav] 获取用户信息出错:', error);
        }
        
        if (user) {
          console.log(`[UserNav] 成功获取用户信息，ID: ${user.id.substring(0, 8)}...`);
          setUser(user);
        } else {
          console.log('[UserNav] 未获取到用户信息');
          if (hasSBCookie || localAuth === 'true') {
            // 存在cookie但获取不到用户，等待一会儿后重试
            console.log('[UserNav] 检测到认证状态但API未返回用户，等待后重试');
            setTimeout(async () => {
              try {
                const retryResult = await supabase.auth.getUser();
                if (retryResult.data.user) {
                  console.log('[UserNav] 重试成功获取到用户');
                  setUser(retryResult.data.user);
                } else if (localAuth === 'true') {
                  // 如果重试后仍然没有获取到，但本地有认证标记，强制显示用户界面
                  console.log('[UserNav] 重试仍未获取到用户，但本地有认证标记，强制显示用户界面');
                  setForceShowUser(true);
                }
              } catch (retryErr) {
                console.error('[UserNav] 重试获取用户信息失败:', retryErr);
              } finally {
                setIsLoading(false);
              }
            }, 1000);
            return; // 等待异步重试，不要设置isLoading=false
          }
        }
      } catch (err) {
        console.error('[UserNav] 获取用户信息异常:', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    getUser();
    
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log(`[UserNav] 认证状态变化: ${event}`);
        if (session?.user) {
          console.log(`[UserNav] 新会话用户: ${session.user.id.substring(0, 8)}...`);
          setUser(session.user);
          // 更新本地存储
          localStorage.setItem('auth_valid', 'true');
          localStorage.setItem('auth_time', Date.now().toString());
        } else {
          console.log('[UserNav] 会话中没有用户');
          setUser(null);
          if (event === 'SIGNED_OUT') {
            localStorage.removeItem('auth_valid');
            localStorage.removeItem('auth_time');
          }
        }
      }
    );
    
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase.auth]);
  
  const handleSignOut = async () => {
    if (isSigningOut) return; // 防止重复点击
    
    try {
      setIsSigningOut(true);
      console.log('[UserNav] 开始登出操作');
      
      // 清除本地存储的认证信息
      localStorage.removeItem('auth_valid');
      localStorage.removeItem('auth_time');
      setForceShowUser(false);
      
      // 执行客户端登出
      await supabase.auth.signOut();
      console.log('[UserNav] 客户端登出成功');
      
      // 简单方式：直接重新加载页面
      window.location.href = '/sign-in';
    } catch (error) {
      console.error('[UserNav] 登出过程中出错:', error);
      setIsSigningOut(false);
      
      // 出错时仍然尝试清除状态并重定向
      try {
        localStorage.removeItem('auth_valid');
        localStorage.removeItem('auth_time');
        setForceShowUser(false);
        window.location.href = '/sign-in';
      } catch (e) {
        alert('登出失败，请刷新页面重试');
      }
    }
  };
  
  // 强制刷新会话
  const refreshSession = async () => {
    try {
      console.log('[UserNav] 尝试刷新会话');
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('[UserNav] 刷新会话出错:', error);
      } else if (data.session) {
        console.log('[UserNav] 会话刷新成功');
        setUser(data.session.user);
      }
    } catch (error) {
      console.error('[UserNav] 刷新会话异常:', error);
    }
  };
  
  if (isLoading) {
    return null; // 加载中不显示
  }
  
  // 如果有用户或强制显示用户界面，则显示用户信息和登出按钮
  const shouldShowUserUI = user || forceShowUser;
  
  return (
    <div className="fixed top-6 right-6 z-[5000] flex items-center gap-4">
      {shouldShowUserUI ? (
        <div className="flex items-center gap-4 bg-white/80 dark:bg-black/80 backdrop-blur-md rounded-full px-4 py-2 shadow-lg border border-gray-200 dark:border-gray-800">
          <UserCreditDisplay />
          
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
          
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{isSigningOut ? "退出中..." : "退出"}</span>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshSession}
            className="rounded-full"
          >
            <User className="h-4 w-4 mr-2" />
            <span>刷新</span>
          </Button>
          
          <Button
            asChild
            className="rounded-full bg-white/80 dark:bg-black/80 backdrop-blur-md shadow-lg border border-gray-200 dark:border-gray-800"
          >
            <Link href="/sign-in" className="gap-2">
              <LogIn className="h-4 w-4" />
              <span>登录</span>
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
} 