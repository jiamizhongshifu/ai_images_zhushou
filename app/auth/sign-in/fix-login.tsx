"use client";

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * 登录修复组件
 * 用于处理登录状态异常时的恢复
 */
export default function FixLogin({
  redirectUrl = '/dashboard'
}: {
  redirectUrl?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams?.get('redirect') || null;
  const supabase = createClient();
  const [userChecked, setUserChecked] = useState(false);
  const [fixingLogin, setFixingLogin] = useState(false);
  
  // 清除所有登出标记
  const clearLogoutFlags = () => {
    try {
      if (typeof window !== 'undefined') {
        console.log('[FixLogin] 清除登出标记');
        
        // 清除localStorage和sessionStorage中的登出标记
        localStorage.removeItem('force_logged_out');
        sessionStorage.removeItem('isLoggedOut');
        
        // 清除cookie中的登出标记
        document.cookie = 'logged_out=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'force_login=true; path=/; max-age=3600';
        document.cookie = 'skip_auth_check=true; path=/; max-age=3600';
        
        console.log('[FixLogin] 登出标记已清除');
      }
    } catch (error) {
      console.error('[FixLogin] 清除登出标记出错:', error);
    }
  };
  
  useEffect(() => {
    const checkAndFixLogin = async () => {
      try {
        // 清除任何可能存在的登出标记
        clearLogoutFlags();
        
        // 检查用户会话
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          console.log('用户已登录，准备重定向');
          // 设置cookie标记用户已登录
          document.cookie = 'user_authenticated=true; path=/; max-age=86400';
          
          if (redirectPath) {
            router.push(redirectPath + '?skip_middleware=true');
          } else {
            router.push(redirectUrl + '?skip_middleware=true');
          }
        } else {
          console.log('用户未登录，显示登录按钮');
          setUserChecked(true);
        }
      } catch (error) {
        console.error('登录检查出错:', error);
        setUserChecked(true);
      }
    };
    
    checkAndFixLogin();
  }, [router, redirectUrl, redirectPath, supabase]);
  
  const handleFixLogin = async () => {
    if (fixingLogin) return;
    
    try {
      setFixingLogin(true);
      console.log('尝试修复登录状态');
      
      // 清除登出标记
      clearLogoutFlags();
      
      // 先进行登出操作确保清除会话
      await supabase.auth.signOut();
      
      // 跳转到登录页
      console.log('已重置会话状态，跳转到登录页');
      router.push('/sign-in?reset=true');
    } catch (error) {
      console.error('修复登录时出错:', error);
      router.push('/sign-in?error=fix_failed');
    } finally {
      setFixingLogin(false);
    }
  };
  
  if (!userChecked) {
    return (
      <div className="flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-lg">检查登录状态...</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center p-4 mb-6">
      <h1 className="text-xl font-bold mb-3">登录状态需要修复</h1>
      <p className="mb-4 text-center max-w-md text-sm text-gray-600">
        检测到您的登录状态异常，请点击下方按钮重置状态。
      </p>
      <Button onClick={handleFixLogin} disabled={fixingLogin} className="w-full max-w-xs">
        {fixingLogin ? '正在修复...' : '重置登录状态'}
      </Button>
    </div>
  );
} 