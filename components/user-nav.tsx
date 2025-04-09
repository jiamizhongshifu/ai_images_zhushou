"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { User, LogOut, LogIn } from 'lucide-react';
import UserCreditDisplay from '@/components/user-credit-display';
import { authService } from '@/utils/auth-service';
import { User as SupabaseUser } from '@supabase/supabase-js';

// 定义积分信息类型
interface CreditsInfo {
  totalCredits: number;
  usedCredits: number;
  availableCredits: number;
}

export default function UserNav() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [forceShowUser, setForceShowUser] = useState(false); // 强制显示用户状态的标志
  const [open, setOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<SupabaseUser | null>(null);
  const [creditsInfo, setCreditsInfo] = useState<CreditsInfo | null>(null);
  const supabase = createClient();
  
  useEffect(() => {
    fetchUserInfo();
  }, []);
  
  const fetchUserInfo = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      setUserInfo(data.user);
      
      if (data.user) {
        const response = await fetch('/api/credits/get');
        if (response.ok) {
          const creditsData = await response.json();
          setCreditsInfo(creditsData);
        }
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  };
  
  useEffect(() => {
    async function getUser() {
      try {
        console.log('[UserNav] 开始获取用户信息');
        
        // 检查是否有登出标记，如果有则跳过获取用户信息
        const forceLoggedOut = localStorage.getItem('force_logged_out') === 'true';
        const isLoggedOut = sessionStorage.getItem('isLoggedOut') === 'true';
        
        if (forceLoggedOut || isLoggedOut) {
          console.log('[UserNav] 检测到登出标记，强制设置未登录状态');
          setUser(null);
          setForceShowUser(false);
          setIsLoading(false);
          
          // 为确保状态一致，也通知认证服务
          authService.clearAuthState();
          return;
        }
        
        // 检查认证状态 - 优先通过API检查服务器会话
        console.log('[UserNav] 检查服务器会话状态');
        const isValidSession = await checkServerSession();
        
        if (!isValidSession) {
          console.log('[UserNav] 服务器会话无效，设置为未登录状态');
          setUser(null);
          setForceShowUser(false);
          setIsLoading(false);
          return;
        }
        
        // 服务器会话有效，继续获取用户信息
        const userInfo = await authService.getUserInfo();
        
        if (userInfo) {
          console.log(`[UserNav] 成功获取用户信息，ID: ${userInfo.id.substring(0, 8)}...`);
          setUser(userInfo);
        } else {
          console.log('[UserNav] 未获取到用户信息，但服务器会话有效');
          setForceShowUser(true);
        }
      } catch (err) {
        console.error('[UserNav] 获取用户信息异常:', err);
        
        // 出错时设置为未登录状态
        setUser(null);
        setForceShowUser(false);
      } finally {
        setIsLoading(false);
      }
    }
    
    // 检查服务器会话
    async function checkServerSession() {
      try {
        // 先使用 API 检查服务器端会话
        const response = await fetch('/api/auth/status', {
          headers: {
            'Cache-Control': 'no-cache, no-store',
            'Pragma': 'no-cache'
          },
          credentials: 'include'
        });
        
        if (!response.ok) {
          console.warn('[UserNav] 获取认证状态失败，状态码:', response.status);
          return false;
        }
        
        const data = await response.json();
        return data.authenticated === true;
      } catch (error) {
        console.error('[UserNav] 检查服务器会话出错:', error);
        return false;
      }
    }
    
    getUser();
    
    // 订阅认证状态变化
    const unsubscribe = authService.subscribe((authState) => {
      console.log(`[UserNav] 认证状态更新: isAuthenticated=${authState.isAuthenticated}`);
      
      // 检查是否有登出标记
      const forceLoggedOut = localStorage.getItem('force_logged_out') === 'true';
      const isLoggedOut = sessionStorage.getItem('isLoggedOut') === 'true';
      
      if (forceLoggedOut || isLoggedOut) {
        console.log('[UserNav] 认证回调中检测到登出标记，强制设置为未登录状态');
        setUser(null);
        setForceShowUser(false);
        return;
      }
      
      if (authState.isAuthenticated) {
        // 当认证状态更新为已认证，尝试获取用户信息
        authService.getUserInfo().then(userInfo => {
          if (userInfo) {
            console.log('[UserNav] 认证状态更新后获取到用户信息');
            setUser(userInfo);
          } else {
            console.log('[UserNav] 认证状态更新后未获取到用户信息，但认证有效');
            setForceShowUser(true);
          }
        }).catch(error => {
          console.error('[UserNav] 认证状态更新后获取用户信息失败:', error);
          // 虽然认证有效但获取信息失败，也显示用户界面
          setForceShowUser(true);
        });
      } else {
        // 当认证状态更新为未认证，清除用户信息
        console.log('[UserNav] 认证状态更新为未认证，清除用户信息');
        setUser(null);
        setForceShowUser(false);
      }
    });
    
    // 添加路由变化监听，确保在页面切换时重新检查
    const handleRouteChange = () => {
      console.log('[UserNav] 检测到路由变化，重新检查认证状态');
      
      // 检查登出标记
      const forceLoggedOut = localStorage.getItem('force_logged_out') === 'true';
      const isLoggedOut = sessionStorage.getItem('isLoggedOut') === 'true';
      
      if (forceLoggedOut || isLoggedOut) {
        console.log('[UserNav] 路由变化时检测到登出标记，强制设置为未登录状态');
        setUser(null);
        setForceShowUser(false);
      } else {
        // 通过认证服务检查状态
        if (!authService.isAuthenticated()) {
          console.log('[UserNav] 路由变化时认证状态为未登录');
          setUser(null);
          setForceShowUser(false);
        }
      }
    };
    
    // 监听popstate事件（浏览器后退/前进等导航操作）
    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      unsubscribe(); // 清理认证订阅
      window.removeEventListener('popstate', handleRouteChange); // 清理路由监听
    };
  }, []);
  
  const handleLogout = async () => {
    try {
      setIsSigningOut(true);
      
      console.log('[UserNav] 开始登出操作');
      
      // 1. 先设置临时登出标记，立即影响UI
      localStorage.setItem('force_logged_out', 'true');
      sessionStorage.setItem('isLoggedOut', 'true');
      
      // 2. 调用API登出端点，确保服务器端也清除会话
      try {
        const response = await fetch('/api/auth/signout', {
          method: 'POST',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        
        if (!response.ok) {
          console.warn('[UserNav] 登出API调用失败，状态码:', response.status);
        } else {
          console.log('[UserNav] 服务端登出成功');
        }
      } catch (apiError) {
        console.error('[UserNav] 调用登出API出错:', apiError);
      }
      
      // 3. 清除认证服务状态
      authService.clearAuthState();
      
      // 4. 手动清除所有可能的Cookie
      const cookieNames = [
        'sb-access-token', 
        'sb-refresh-token', 
        '__session', 
        'sb-refresh-token-nonce', 
        'user_authenticated'
      ];
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
      
      // 5. 清除localStorage中所有可能的认证数据
      const keysToRemove = [
        'supabase.auth.token',
        'supabase.auth.expires_at',
        'auth_state',
        'auth_valid',
        'auth_time',
        'wasAuthenticated'
      ];
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // 6. 将登出状态保存到sessionStorage，增加时间戳防止缓存
      sessionStorage.setItem('isLoggedOut', 'true');
      sessionStorage.setItem('logoutTime', Date.now().toString());
      
      // 7. 刷新页面，传递参数确保中间件也知道登出状态
      console.log('[UserNav] 登出操作完成, 页面将重定向');
      window.location.href = '/?force_logout=true&time=' + Date.now();
    } catch (error) {
      console.error('[UserNav] 登出过程中发生错误:', error);
      alert("退出登录时发生错误");
      
      // 即使出错也尝试重定向
      window.location.href = '/?force_logout=true&error=true';
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
  const clearLogoutFlags = async () => {
    console.log('[UserNav] 开始清除登出标记');
    
    // 本地存储清除
    localStorage.removeItem('force_logged_out');
    sessionStorage.removeItem('isLoggedOut');
    sessionStorage.removeItem('logoutTime');
    
    // 调用服务器端API清除cookie
    try {
      const response = await fetch('/api/auth/clear-logout-flags', {
        method: 'POST',
        headers: {
          'Cache-Control': 'no-cache, no-store',
          'Pragma': 'no-cache'
        },
        credentials: 'include'
      });
      
      if (response.ok) {
        console.log('[UserNav] 服务器端成功清除登出标记');
      } else {
        console.warn('[UserNav] 服务器端清除登出标记失败:', response.status);
      }
    } catch (error) {
      console.error('[UserNav] 调用清除登出标记API出错:', error);
    }
    
    // 确保浏览器中的cookie也被清除
    const cookiesToClear = ['logged_out', 'force_logged_out', 'isLoggedOut'];
    const commonOptions = '; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    
    cookiesToClear.forEach(cookieName => {
      document.cookie = `${cookieName}=${commonOptions}`;
      document.cookie = `${cookieName}=${commonOptions}; domain=${window.location.hostname}`;
    });
    
    // 设置重定向URL并添加时间戳参数防止缓存
    const currentUrl = new URL('/sign-in', window.location.origin);
    currentUrl.searchParams.set('clear_logout_flags', 'true');
    currentUrl.searchParams.set('t', Date.now().toString());
    
    // 添加强制登录标记cookie
    document.cookie = 'force_login=true; path=/; max-age=3600';
    
    console.log('[UserNav] 登出标记已清除，正在跳转到登录页面');
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