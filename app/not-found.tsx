'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function NotFound() {
  const [countdown, setCountdown] = useState(5);
  const [redirectPath, setRedirectPath] = useState('/');
  const [isRedirecting, setIsRedirecting] = useState(false);
  
  useEffect(() => {
    // 检查当前路径
    const path = window.location.pathname;
    console.log(`[404页面] 访问不存在的路径: ${path}`);
    
    // 检查特殊路径并设置重定向目标
    if (path === '/login') {
      setRedirectPath('/sign-in');
      setIsRedirecting(true);
    } else if (path.startsWith('/auth/login')) {
      setRedirectPath('/auth/sign-in');
      setIsRedirecting(true);
    } else if (path.startsWith('/api/')) {
      // API路径不自动重定向
      return;
    }
    
    // 如果需要重定向，开始倒计时
    if (isRedirecting) {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            window.location.href = redirectPath;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [redirectPath, isRedirecting]);
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-2">
      <div className="text-center max-w-md mx-auto p-8 bg-white rounded-xl shadow-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">页面不存在</h1>
        <p className="text-gray-600 mb-6">
          您尝试访问的页面不存在或已被移动到其他位置。
        </p>
        
        {isRedirecting ? (
          <div className="my-6 p-4 bg-blue-50 text-blue-700 rounded-md">
            <p>检测到您正在访问旧路径，将在 <span className="font-bold">{countdown}</span> 秒后自动重定向到正确页面。</p>
          </div>
        ) : null}
        
        <div className="flex flex-col space-y-3">
          <Link
            href="/"
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition duration-200"
          >
            返回首页
          </Link>
          
          {isRedirecting ? (
            <Link
              href={redirectPath}
              className="px-4 py-2 bg-white border border-indigo-600 text-indigo-600 rounded-md hover:bg-indigo-50 transition duration-200"
            >
              立即前往正确页面
            </Link>
          ) : null}
          
          <Link
            href="/sign-in"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition duration-200"
          >
            登录
          </Link>
        </div>
      </div>
    </div>
  );
} 