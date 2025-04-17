"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeSetItem, safeGetItem } from '@/app/lib/mock-storage';

export function LoginFormWrapper() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [redirectUrl, setRedirectUrl] = useState<string>('/protected');
  
  // 获取和保存重定向URL
  useEffect(() => {
    const redirect = searchParams?.get('redirect') || '/protected';
    setRedirectUrl(redirect);
    
    // 保存重定向URL，供登录后使用
    try {
      console.log('[LoginWrapper] 保存重定向URL:', redirect);
      safeSetItem('redirect_after_login', redirect);
    } catch (error) {
      console.error('[LoginWrapper] 保存重定向URL失败:', error);
    }
  }, [searchParams]);
  
  // 成功登录后的处理
  const onLoginSuccess = () => {
    try {
      const savedRedirect = safeGetItem('redirect_after_login') || redirectUrl;
      console.log('[LoginWrapper] 登录成功，重定向到:', savedRedirect);
      router.push(savedRedirect);
    } catch (error) {
      console.error('[LoginWrapper] 重定向失败:', error);
      // 出错时默认重定向到保护页
      router.push('/protected');
    }
  };
  
  return (
    <div className="w-full">
      <div className="space-y-4">
        {/* 暂时移除Google登录按钮 */}
      </div>
    </div>
  );
} 