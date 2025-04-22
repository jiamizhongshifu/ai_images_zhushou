'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * OAuth处理组件
 * 用于监听并处理 OAuth 重定向参数
 */
export default function OAuthHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // 检查URL中是否有OAuth参数
    const hasOAuthCode = searchParams?.get('code');
    const hasOAuthState = searchParams?.get('state');
    
    if (hasOAuthCode) {
      console.log('[OAuthHandler] 检测到 OAuth code 参数，处理中...');
      
      // 构建回调URL，包含所有可用参数
      let callbackUrl = `/auth/callback?code=${hasOAuthCode}`;
      if (hasOAuthState) {
        callbackUrl += `&state=${hasOAuthState}`;
      }
      
      // 重定向到我们的回调处理路由
      router.push(callbackUrl);
    } else {
      // 检查本地存储中的认证状态
      const isAuthenticated = localStorage.getItem('user_authenticated') === 'true' || 
                             document.cookie.includes('user_authenticated=true');
      
      if (isAuthenticated) {
        // 如果用户已经登录，重定向到首页
        console.log('[OAuthHandler] 检测到用户已登录，重定向到首页');
        router.push('/');
      }
    }
  }, [searchParams, router]);
  
  // 组件不渲染任何内容
  return null;
} 