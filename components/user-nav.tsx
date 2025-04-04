"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { User, LogOut, LogIn } from 'lucide-react';
import UserCreditDisplay from '@/components/user-credit-display';
import { authService } from '@/utils/auth-service';

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
        
        // 检查认证状态
        if (authService.isAuthenticated()) {
          console.log('[UserNav] 认证服务检测到有效认证');
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
        
        // 尝试获取用户信息
        const userInfo = await authService.getUserInfo();
        
        if (userInfo) {
          console.log(`[UserNav] 成功获取用户信息，ID: ${userInfo.id.substring(0, 8)}...`);
          setUser(userInfo);
        } else {
          console.log('[UserNav] 未获取到用户信息');
          
          // 如果认证服务认为用户已认证，但API未返回用户，尝试刷新会话
          if (authService.isAuthenticated()) {
            console.log('[UserNav] 检测到认证状态但API未返回用户，尝试刷新会话');
            
            // 尝试刷新会话
            const refreshResult = await authService.refreshSession();
            
            if (refreshResult) {
              // 重新获取用户信息
              const retryUserInfo = await authService.getUserInfo();
              if (retryUserInfo) {
                console.log('[UserNav] 刷新会话后成功获取用户信息');
                setUser(retryUserInfo);
              } else {
                console.log('[UserNav] 刷新会话后仍未获取到用户信息，但认证状态有效，强制显示用户界面');
                setForceShowUser(true);
              }
            } else {
              console.log('[UserNav] 会话刷新失败，但认证状态有效，强制显示用户界面');
              setForceShowUser(true);
            }
          }
        }
      } catch (err) {
        console.error('[UserNav] 获取用户信息异常:', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    getUser();
    
    // 订阅认证状态变化
    const unsubscribe = authService.subscribe((authState) => {
      console.log(`[UserNav] 认证状态更新: isAuthenticated=${authState.isAuthenticated}`);
      
      if (authState.isAuthenticated) {
        // 当认证状态更新为已认证，尝试获取用户信息
        authService.getUserInfo().then(userInfo => {
          if (userInfo) {
            setUser(userInfo);
          } else {
            setForceShowUser(true);
          }
        });
      } else {
        // 当认证状态更新为未认证，清除用户信息
        setUser(null);
        setForceShowUser(false);
      }
    });
    
    return () => {
      unsubscribe(); // 清理订阅
    };
  }, []);
  
  const handleLogout = async () => {
    try {
      // 先清除认证状态
      authService.clearAuthState();
      
      // 将登出状态保存到sessionStorage
      sessionStorage.setItem('isLoggedOut', 'true');
      
      // 添加特殊参数防止中间件重定向
      window.location.href = '/sign-in?force_logout=true';
      
      console.log('登出操作完成, 页面将重定向到登录页');
    } catch (error) {
      console.error('登出过程中发生错误:', error);
      alert("退出登录时发生错误");
    }
  };
  
  // 强制刷新会话
  const refreshSession = async () => {
    try {
      console.log('[UserNav] 尝试刷新会话');
      const result = await authService.refreshSession();
      
      if (result) {
        console.log('[UserNav] 会话刷新成功');
        // 重新获取用户信息
        const userInfo = await authService.getUserInfo();
        if (userInfo) {
          setUser(userInfo);
        }
      } else {
        console.log('[UserNav] 会话刷新失败');
      }
    } catch (error) {
      console.error('[UserNav] 刷新会话异常:', error);
    }
  };
  
  const handleManualAuth = () => {
    console.log('[UserNav] 手动设置认证状态');
    authService.manualAuthenticate();
    setForceShowUser(true);
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
            onClick={handleLogout}
            disabled={isSigningOut}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{isSigningOut ? "退出中..." : "退出"}</span>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
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