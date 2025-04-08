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
  const reset = searchParams?.get('reset') === 'true';
  const supabase = createClient();
  const [userChecked, setUserChecked] = useState(false);
  const [fixingLogin, setFixingLogin] = useState(false);
  const [needsFix, setNeedsFix] = useState(false);
  
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
        // 如果URL中有reset参数，直接跳过检查
        if (reset) {
          console.log('[FixLogin] 检测到reset参数，跳过检查');
          setUserChecked(true);
          return;
        }
        
        // 尝试清除登出标记，为检查做准备
        clearLogoutFlags();
        
        // 检查用户会话
        const { data: { user } } = await supabase.auth.getUser();
        
        // 如果能获取到用户会话，表示登录正常，直接跳转
        if (user) {
          console.log('[FixLogin] 用户会话有效，准备重定向');
          // 设置cookie标记用户已登录
          document.cookie = 'user_authenticated=true; path=/; max-age=86400';
          
          // 用户已登录，不需要显示修复界面
          setNeedsFix(false);
          
          // 如果有重定向路径，跳转到指定页面
          if (redirectPath) {
            router.push(redirectPath + '?skip_middleware=true');
          } else {
            router.push(redirectUrl + '?skip_middleware=true');
          }
          return;
        }
        
        // 检查是否存在登录异常情况
        try {
          const hasLocalSession = !!localStorage.getItem('supabase.auth.token');
          const hasCookie = !!document.cookie.match(/sb-access-token/);
          
          // 如果本地存储有会话，但API检查无效，可能存在状态不一致
          if (hasLocalSession || hasCookie) {
            console.log('[FixLogin] 检测到登录状态不一致，需要修复');
            setNeedsFix(true);
          } else {
            console.log('[FixLogin] 未检测到异常登录状态，显示正常登录表单');
            setNeedsFix(false);
          }
        } catch (storageError) {
          console.error('[FixLogin] 检查本地存储出错:', storageError);
          // 存储访问错误，不确定状态，不显示修复界面
          setNeedsFix(false);
        }
        
        setUserChecked(true);
      } catch (error) {
        console.error('[FixLogin] 登录检查出错:', error);
        setUserChecked(true);
        setNeedsFix(false); // 出错时不显示修复界面，避免重复问题
      }
    };
    
    checkAndFixLogin();
  }, [router, redirectUrl, redirectPath, supabase, reset]);
  
  const handleFixLogin = async () => {
    if (fixingLogin) return;
    
    try {
      setFixingLogin(true);
      console.log('[FixLogin] 尝试修复登录状态');
      
      // 清除登出标记
      clearLogoutFlags();
      
      // 先进行登出操作确保清除会话
      await supabase.auth.signOut();
      
      // 清除所有可能的会话存储
      try {
        localStorage.removeItem('supabase.auth.token');
        localStorage.removeItem('supabase.auth.expires_at');
        sessionStorage.removeItem('supabase.auth.token');
      } catch (e) {
        console.error('[FixLogin] 清除存储出错:', e);
      }
      
      // 清除所有相关cookie
      document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = 'sb-refresh-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      
      // 跳转到登录页
      console.log('[FixLogin] 已重置会话状态，跳转到登录页');
      router.push('/sign-in?reset=true');
    } catch (error) {
      console.error('[FixLogin] 修复登录时出错:', error);
      router.push('/sign-in?error=fix_failed');
    } finally {
      setFixingLogin(false);
    }
  };
  
  // 如果检查未完成，显示加载状态
  if (!userChecked) {
    return (
      <div className="flex items-center justify-center p-2">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="ml-2 text-sm text-muted-foreground">检查登录状态...</p>
      </div>
    );
  }
  
  // 如果不需要修复，不显示任何内容
  if (!needsFix) {
    return null;
  }
  
  // 显示修复界面
  return (
    <div className="flex flex-col items-center justify-center p-4 mb-6 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
      <h1 className="text-lg font-bold mb-2 text-yellow-800 dark:text-yellow-400">登录状态需要修复</h1>
      <p className="mb-3 text-center max-w-md text-sm text-yellow-700 dark:text-yellow-500">
        检测到您的登录状态异常，请点击下方按钮重置状态后重新登录。
      </p>
      <Button 
        onClick={handleFixLogin} 
        disabled={fixingLogin} 
        variant="outline"
        className="w-full max-w-xs text-yellow-800 bg-yellow-100 border-yellow-300 hover:bg-yellow-200 dark:text-yellow-300 dark:bg-yellow-900 dark:border-yellow-700 dark:hover:bg-yellow-800"
      >
        {fixingLogin ? '正在修复...' : '重置登录状态'}
      </Button>
    </div>
  );
} 