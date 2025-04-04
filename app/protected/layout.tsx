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

  // 验证用户是否已登录，未登录则重定向到登录页
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
    
    // 快速检查认证状态
    const quickCheck = () => {
      // 使用认证服务检查认证状态
      if (authService.isAuthenticated()) {
        console.log("[受保护页面] 认证服务检测到有效认证");
        return true;
      }
      
      return false;
    };
    
    // 如果快速检查通过，直接显示内容
    if (quickCheck()) {
      return;
    }
    
    // 否则进行详细API验证，此时设置loading状态
    const fullCheck = async () => {
      if (mounted) setLoading(true); // 显示加载状态
      
      try {
        // 在控制台打印当前验证状态
        console.log("[受保护页面] 开始API验证用户会话");
        
        // 首先检查URL参数，如果有登录标记，直接显示内容
        const urlParams = new URLSearchParams(window.location.search);
        const justLoggedIn = urlParams.get('just_logged_in');
        
        if (justLoggedIn) {
          console.log("[受保护页面] 检测到刚刚登录的标记，跳过会话验证");
          authService.manualAuthenticate(); // 手动设置认证状态
          if (mounted) setLoading(false);
          return;
        }
        
        // 尝试刷新会话
        console.log("[受保护页面] 尝试刷新会话");
        const refreshResult = await authService.refreshSession();
        
        if (refreshResult) {
          console.log("[受保护页面] 会话刷新成功");
          if (mounted) setLoading(false);
        } else {
          // 尝试获取用户信息
          console.log("[受保护页面] 会话刷新失败，尝试获取用户信息");
          const userInfo = await authService.getUserInfo();
          
          if (userInfo) {
            console.log(`[受保护页面] 获取用户信息成功，用户ID: ${userInfo.id.substring(0, 8)}...`);
            if (mounted) setLoading(false);
          } else {
            // 所有尝试都失败
            console.log("[受保护页面] API验证失败，重定向到登录页");
            if (mounted) {
              router.push("/sign-in");
            }
          }
        }
      } catch (error) {
        console.error("[受保护页面] 验证会话时出错:", error);
        if (mounted) {
          router.push("/sign-in");
        }
      }
    };

    // 执行完整检查
    fullCheck();
    
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