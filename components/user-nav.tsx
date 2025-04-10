"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { User, LogOut, LogIn } from 'lucide-react';
import { UserCreditDisplay } from '@/components/user-credit-display';
import { authService, forceSyncAuthState } from '@/utils/auth-service';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useUserState } from '@/app/components/providers/user-state-provider';

// 定义积分信息类型
interface CreditsInfo {
  totalCredits: number;
  usedCredits: number;
  availableCredits: number;
}

export default function UserNav() {
  const router = useRouter();
  const searchParams = useSearchParams(); // 获取URL参数
  
  // 使用全局状态作为主要状态源
  const { isAuthenticated, userInfoLoaded, triggerCreditRefresh, refreshUserState } = useUserState();
  
  // 仅保留必要的本地状态
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [userDetails, setUserDetails] = useState<any>(null);
  const [localLoading, setLocalLoading] = useState(false);
  // 添加本地认证状态，处理加载中状态
  const [localUserLoaded, setLocalUserLoaded] = useState(false);
  const supabase = createClient();
  
  // 监听URL参数变化
  useEffect(() => {
    // 检查是否有登出参数
    const loggedOut = searchParams?.get('logged_out') === 'true';
    if (loggedOut) {
      console.log('[UserNav] 检测到登出URL参数，强制重置状态');
      resetLocalState();
    }
  }, [searchParams]);
  
  // 重置所有本地状态的函数
  const resetLocalState = () => {
    console.log('[UserNav] 重置所有本地状态');
    setUserDetails(null);
    setLocalUserLoaded(false);
    setLocalLoading(false);
  };
  
  // 监听全局认证状态变化
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('[UserNav] 全局认证状态为未登录，重置本地状态');
      resetLocalState();
    }
  }, [isAuthenticated]);
  
  // 组件挂载时立即获取当前会话
  useEffect(() => {
    // 检查是否已登出状态
    const isLoggedOut = localStorage.getItem('force_logged_out') === 'true' || 
                        sessionStorage.getItem('isLoggedOut') === 'true';
    
    if (isLoggedOut) {
      console.log('[UserNav] 检测到登出标记，跳过初始会话检查');
      resetLocalState();
      return;
    }
    
    const checkCurrentUser = async () => {
      try {
        console.log('[UserNav] 组件挂载时检查当前用户');
        setLocalLoading(true);
        
        // 直接使用推荐的getUser方法获取当前用户
        const { data, error } = await supabase.auth.getUser();
        
        if (data && data.user) {
          console.log('[UserNav] 直接获取到用户:', data.user.id);
          setUserDetails(data.user);
          setLocalUserLoaded(true);
          
          // 同步全局状态
          await forceSyncAuthState();
          await refreshUserState({ forceRefresh: false, showLoading: false });
        } else {
          console.log('[UserNav] 直接获取用户失败:', error);
          setLocalUserLoaded(false);
        }
      } catch (error) {
        console.error('[UserNav] 获取当前用户出错:', error);
      } finally {
        setLocalLoading(false);
      }
    };
    
    checkCurrentUser();
  }, []);
  
  // 当认证状态或用户信息加载状态变化时获取用户详情
  useEffect(() => {
    if (isAuthenticated || userInfoLoaded) {
      fetchUserDetails();
    } else {
      setUserDetails(null);
      setLocalUserLoaded(false);
    }
  }, [isAuthenticated, userInfoLoaded]);
  
  // 获取用户详细信息（可选）
  const fetchUserDetails = async () => {
    // 检查是否已登出状态
    const isLoggedOut = localStorage.getItem('force_logged_out') === 'true' || 
                        sessionStorage.getItem('isLoggedOut') === 'true';
    
    if (isLoggedOut) {
      console.log('[UserNav] 检测到登出标记，跳过获取用户详情');
      resetLocalState();
      return;
    }
    
    try {
      setLocalLoading(true);
      
      // 优先使用Supabase直接获取用户信息
      try {
        const { data, error } = await supabase.auth.getUser();
        if (data && data.user) {
          console.log('[UserNav] 通过Supabase直接获取用户详情成功');
          setUserDetails(data.user);
          setLocalUserLoaded(true);
          return;
        }
      } catch (e) {
        console.warn('[UserNav] Supabase获取用户详情失败，尝试备用方法');
      }
      
      // 备用：通过认证服务获取用户详情
      const userInfo = await authService.getUserInfo();
      if (userInfo) {
        console.log('[UserNav] 通过认证服务获取用户详情成功');
        setUserDetails(userInfo);
        setLocalUserLoaded(true);
      } else {
        // 如果获取不到用户信息，确保本地状态被重置
        resetLocalState();
      }
    } catch (error) {
      console.error('[UserNav] 获取用户详情失败:', error);
      resetLocalState();
    } finally {
      setLocalLoading(false);
    }
  };
  
  const handleLogout = async () => {
    try {
      setIsSigningOut(true);
      
      console.log('[UserNav] 开始登出操作');
      
      // 1. 先设置临时登出标记，立即影响UI
      localStorage.setItem('force_logged_out', 'true');
      sessionStorage.setItem('isLoggedOut', 'true');
      
      // 2. 主动重置本地状态，确保UI立即响应
      resetLocalState();
      
      // 3. 调用API登出端点，确保服务器端也清除会话
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
      
      // 4. 清除认证服务状态
      authService.clearAuthState();
      
      // 5. 手动清除所有可能的Cookie
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
      
      // 6. 清除localStorage中所有可能的认证数据
      const keysToRemove = [
        'supabase.auth.token',
        'supabase.auth.expires_at',
        'auth_state',
        'auth_valid',
        'auth_time',
        'wasAuthenticated'
      ];
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // 7. 将登出状态保存到sessionStorage，增加时间戳防止缓存
      sessionStorage.setItem('isLoggedOut', 'true');
      sessionStorage.setItem('logoutTime', Date.now().toString());
      
      // 8. 使用router保存状态并平滑跳转，而非硬刷新
      console.log('[UserNav] 登出操作完成, 页面将重定向');
      // 可以使用状态（如sessionStorage）来存储登出信息，而不是通过URL
      sessionStorage.setItem('force_logged_out', 'true');
      // 将跳转参数存储在sessionStorage中，供登录页使用
      sessionStorage.setItem('logout_timestamp', Date.now().toString());
      // 使用router跳转避免整页刷新
      router.push('/?logged_out=true');
    } catch (error) {
      console.error('[UserNav] 登出过程中发生错误:', error);
      alert("退出登录时发生错误");
      
      // 即使出错也尝试使用router跳转
      router.push('/?error=logout_failed');
    } finally {
      setIsSigningOut(false);
    }
  };
  
  // 判断是否应该显示用户界面 - 结合全局状态和本地状态，确保登出状态被考虑
  const isLoggedOut = typeof window !== 'undefined' && (
    localStorage.getItem('force_logged_out') === 'true' || 
    sessionStorage.getItem('isLoggedOut') === 'true'
  );
  
  // 只有在非登出状态时才考虑显示用户界面
  const shouldShowUserUI = !isLoggedOut && (isAuthenticated || userInfoLoaded || localUserLoaded);
  
  // 根据认证状态显示不同内容
  return (
    <div className="flex items-center gap-2">
      {shouldShowUserUI ? (
        <>
          <div className="inline-flex items-center">
            <UserCreditDisplay />
          </div>
          
          <Button
            title="个人中心"
            variant="ghost"
            size="icon"
            className="rounded-full"
            asChild={!isSigningOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <div className="flex h-full w-full items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
              </div>
            ) : (
              <Link href="/dashboard/profile">
                <User className="h-5 w-5" />
              </Link>
            )}
          </Button>
          
          <Button
            title="退出登录"
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={handleLogout}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
            ) : (
              <LogOut className="h-5 w-5" />
            )}
          </Button>
        </>
      ) : (
        <div className="inline-flex gap-2">
          <Button
            title="登录"
            variant="default"
            className="h-9 px-4"
            onClick={() => router.push('/login')}
          >
            <LogIn className="mr-1 h-4 w-4" />
            <span>登录</span>
          </Button>
        </div>
      )}
    </div>
  );
} 