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
  
  useEffect(() => {
    const checkAndFixLogin = async () => {
      try {
        // 检查用户会话
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          console.log('用户已登录，准备重定向');
          if (redirectPath) {
            router.push(redirectPath);
          } else {
            router.push(redirectUrl);
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
    try {
      console.log('尝试修复登录状态');
      
      // 检查本地存储中是否有会话数据
      const localStorageSession = localStorage.getItem('supabase.auth.token');
      
      if (localStorageSession) {
        console.log('找到本地会话数据，尝试恢复');
        
        // 使用本地数据设置会话
        await supabase.auth.setSession(JSON.parse(localStorageSession));
        
        // 重新检查用户
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          console.log('成功恢复登录状态，准备重定向');
          if (redirectPath) {
            router.push(redirectPath);
          } else {
            router.push(redirectUrl);
          }
          return;
        }
      }
      
      // 如果没有恢复成功，重定向到登录页面
      console.log('无法恢复会话，重定向到登录页面');
      router.push('/sign-in');
    } catch (error) {
      console.error('修复登录时出错:', error);
      router.push('/sign-in');
    }
  };
  
  if (!userChecked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-lg">检查登录状态...</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-2xl font-bold mb-4">登录状态需要修复</h1>
      <p className="mb-6 text-center max-w-md">
        检测到您的登录状态异常，请点击下方按钮尝试修复。如果问题持续存在，您将被重定向到登录页面。
      </p>
      <Button onClick={handleFixLogin} className="w-full max-w-xs">
        修复登录状态
      </Button>
    </div>
  );
} 