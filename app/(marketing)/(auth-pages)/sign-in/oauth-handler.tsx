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
      
      // 获取可能存在的 code_verifier
      let codeVerifier = '';
      try {
        if (typeof sessionStorage !== 'undefined') {
          // 先尝试从 sessionStorage 获取
          codeVerifier = sessionStorage.getItem('supabase.auth.code_verifier') || '';
          console.log('[OAuthHandler] 从 sessionStorage 获取到 code_verifier:', !!codeVerifier);
        }
        
        if (!codeVerifier && typeof localStorage !== 'undefined') {
          // 备选：从 localStorage 获取
          codeVerifier = localStorage.getItem('supabase.auth.code_verifier') || '';
          console.log('[OAuthHandler] 从 localStorage 获取到 code_verifier:', !!codeVerifier);
        }
      } catch (error) {
        console.error('[OAuthHandler] 获取 code_verifier 失败:', error);
      }
      
      // 构建回调URL，包含所有可用参数
      let callbackUrl = `/auth/callback?code=${hasOAuthCode}`;
      if (hasOAuthState) {
        callbackUrl += `&state=${hasOAuthState}`;
      }
      
      // 保存 code_verifier 到临时存储中，以便回调处理时使用
      try {
        if (typeof sessionStorage !== 'undefined' && codeVerifier) {
          sessionStorage.setItem('sb_temp_code_verifier', codeVerifier);
        }
      } catch (e) {
        console.error('[OAuthHandler] 保存临时 code_verifier 失败:', e);
      }
      
      // 添加额外的标记，用于调试和错误排查
      callbackUrl += '&source=oauth_handler';
      
      console.log('[OAuthHandler] 重定向到回调处理:', callbackUrl);
      
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