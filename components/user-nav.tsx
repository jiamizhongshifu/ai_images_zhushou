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
  const supabase = await createClient();
  
  useEffect(() => {
    async function getUser() {
      try {
        console.log('[UserNav] 开始获取用户信息');
        
        // 检查是否有登出标记，如果有则跳过获取用户信息
        const forceLoggedOut = localStorage.getItem('force_logged_out');
        const isLoggedOut = sessionStorage.getItem('isLoggedOut');
        
        if (forceLoggedOut === 'true' || isLoggedOut === 'true') {
          console.log('[UserNav] 检测到登出标记，跳过获取用户信息');
          setUser(null);
          setForceShowUser(false);
          setIsLoading(false);
          return;
        }
        
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
      
      // 检查是否有登出标记
      const forceLoggedOut = localStorage.getItem('force_logged_out');
      const isLoggedOut = sessionStorage.getItem('isLoggedOut');
      
      if (forceLoggedOut === 'true' || isLoggedOut === 'true') {
        console.log('[UserNav] 认证回调中检测到登出标记，强制设置为未登录状态');
        setUser(null);
        setForceShowUser(false);
        return;
      }
      
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
      setIsSigningOut(true);
      
      // 记录登出意图到localStorage，使其在页面跳转后仍然有效
      localStorage.setItem('force_logged_out', 'true');
      
      // 先执行Supabase API登出
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Supabase API登出错误:', error);
      }
      
      // 清除认证服务状态
      authService.clearAuthState();
      
      // 手动清除所有可能的Cookie
      const cookieNames = ['sb-access-token', 'sb-refresh-token', '__session', 'sb-refresh-token-nonce'];
      const commonOptions = '; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      
      cookieNames.forEach(cookieName => {
        // 清除默认域下的cookie
        document.cookie = `${cookieName}=${commonOptions}`;
        // 清除当前域下的cookie
        document.cookie = `${cookieName}=${commonOptions}; domain=${window.location.hostname}`;
        
        // 尝试在根域上清除
        const domainParts = window.location.hostname.split('.');
        if (domainParts.length > 1) {
          const rootDomain = domainParts.slice(domainParts.length - 2).join('.');
          document.cookie = `${cookieName}=${commonOptions}; domain=.${rootDomain}`;
        }
      });
      
      // 清除localStorage中所有可能的认证数据
      const keysToRemove = [
        'supabase.auth.token',
        'supabase.auth.expires_at',
        'auth_state',
        'auth_valid',
        'auth_time',
        'wasAuthenticated'
      ];
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // 将登出状态保存到sessionStorage
      sessionStorage.setItem('isLoggedOut', 'true');
      
      // 添加特殊参数防止中间件重定向
      window.location.href = '/?force_logout=true';
      
      console.log('登出操作完成, 页面将重定向到首页');
    } catch (error) {
      console.error('登出过程中发生错误:', error);
      alert("退出登录时发生错误");
    } finally {
      setIsSigningOut(false);
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
  
  // 清除登出标记，用于登录按钮点击时
  const clearLogoutFlags = () => {
    console.log('[UserNav] 清除登出标记');
    localStorage.removeItem('force_logged_out');
    sessionStorage.removeItem('isLoggedOut');
    
    // 清除登出cookie通过添加特定参数
    const currentUrl = new URL('/sign-in', window.location.origin);
    currentUrl.searchParams.set('clear_logout_flags', 'true');
    window.location.href = currentUrl.toString();
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
            className="rounded-full bg-white/80 dark:bg-black/80 backdrop-blur-md shadow-lg border border-gray-200 dark:border-gray-800"
            onClick={clearLogoutFlags}
          >
            <div className="flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              <span>登录</span>
            </div>
          </Button>
        </div>
      )}
    </div>
  );
} 