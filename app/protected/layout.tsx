"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import UserNav from "@/components/user-nav";
import { ThemeProvider } from "next-themes";
import { authService } from "@/utils/auth-service";

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const supabase = createClient();
  // 添加加载状态
  const [loading, setLoading] = useState(false); // 默认不显示加载状态

  // 改进会话验证逻辑，使用多级恢复策略
  const validateSession = async () => {
    try {
      console.log("[受保护页面] 开始验证用户会话");
      
      // 1. 快速检查 - 使用认证服务中内存状态
      if (authService.isAuthenticated()) {
        console.log("[受保护页面] 认证服务报告用户已登录");
        return true;
      }
      
      // 2. 尝试自动恢复会话
      console.log("[受保护页面] 尝试自动恢复会话");
      const refreshResult = await authService.refreshSession();
      
      if (refreshResult) {
        console.log("[受保护页面] 会话恢复成功");
        return true;
      }
      
      // 3. 尝试获取用户信息，作为最后努力
      console.log("[受保护页面] 尝试获取用户信息");
      const userInfo = await authService.getUserInfo();
      
      if (userInfo) {
        console.log("[受保护页面] 成功获取用户信息，自动认证");
        authService.manualAuthenticate();
        return true;
      }
      
      console.log("[受保护页面] 所有验证方法失败，用户未认证");
      return false;
    } catch (error) {
      console.error("[受保护页面] 验证会话时出错:", error);
      return false;
    }
  };

  // 页面挂载时使用改进的验证逻辑
  useEffect(() => {
    let mounted = true;
    
    // 检查是否刚刚进行了登出操作
    const checkLogoutState = () => {
      try {
        const isLoggedOut = sessionStorage.getItem('isLoggedOut');
        if (isLoggedOut === 'true') {
          console.log('[Layout] 检测到登出标志，重定向到登录页');
          // 清除标志
          sessionStorage.removeItem('isLoggedOut');
          // 强制跳转到登录页
          window.location.href = '/sign-in';
          return true;
        }
        return false;
      } catch (error) {
        console.warn('[Layout] 检查登出状态时出错:', error);
        return false;
      }
    };

    // 优先检查登出状态
    if (checkLogoutState()) {
      return;
    }
    
    // 快速验证流程
    const quickCheck = async () => {
      try {
        // 使用提升的验证逻辑，避免不必要的API调用
        const isAuthenticated = await validateSession();
        
        if (!isAuthenticated && mounted) {
          console.log("[受保护页面] 验证失败，重定向到登录页");
          router.push("/sign-in");
        } else if (mounted) {
          console.log("[受保护页面] 验证成功，用户可访问");
          setLoading(false);
        }
      } catch (error) {
        console.error("[受保护页面] 验证过程中出错:", error);
        if (mounted) {
          router.push("/sign-in");
        }
      }
    };
    
    // 执行验证
    quickCheck();
    
    // 清理函数
    return () => {
      mounted = false;
    };
  }, [router]);

  // 处理直接访问按钮点击
  const handleDirectAccess = () => {
    console.log("[受保护页面] 用户点击直接访问按钮");
    // 使用认证服务手动设置认证状态
    authService.manualAuthenticate();
    setLoading(false);
  };

  // 如果正在加载，显示加载状态
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
        <p className="text-lg mb-2">验证登录状态...</p>
        <button
          onClick={handleDirectAccess}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
        >
          点击继续访问
        </button>
      </div>
    );
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <div className="relative min-h-screen">
        {/* 只保留用户信息和登出 */}
        <UserNav />
        
        <main className="min-h-screen pt-6">
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
} 