"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { authService } from "@/utils/auth-service";
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { enhanceAuthResilience } from '@/utils/auth-resilience';
import { Button } from '@/components/ui/button';

/**
 * 受保护区域的布局组件
 * 负责验证用户是否已登录，并根据登录状态显示不同内容
 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();
  // 添加加载状态
  const [loading, setLoading] = useState(true); // 默认显示加载状态
  const [showAccessButton, setShowAccessButton] = useState(false);

  // 启用认证弹性增强
  useEffect(() => {
    // 启用认证弹性增强（提供离线认证模式支持）
    enhanceAuthResilience();
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      try {
        // 检查用户会话
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // 用户已登录，不显示加载状态
          setLoading(false);
        } else {
          // 用户未登录，显示访问按钮
          setShowAccessButton(true);
          setLoading(false);
        }
      } catch (error) {
        console.error('检查用户会话出错:', error);
        // 出错时也显示访问按钮
        setShowAccessButton(true);
        setLoading(false);
      }
    };
    
    checkUser();
  }, [supabase]);

  // 改进会话验证逻辑，使用多级恢复策略
  const validateSession = async () => {
    try {
      console.log("[受保护页面] 开始验证用户会话");
      
      // 检查页面URL中的特殊参数
      const hasForceLoginParam = typeof window !== 'undefined' && 
        window.location.search.includes('force_login=true');
      
      if (hasForceLoginParam) {
        console.log("[受保护页面] 检测到强制登录参数，跳过验证");
        authService.manualAuthenticate();
        return true;
      }
      
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
      
      // 4. 显示直接访问按钮作为最终方案
      console.log("[受保护页面] 所有验证方法失败，显示直接访问按钮");
      setShowAccessButton(true);
      
      return false;
    } catch (error) {
      console.error("[受保护页面] 验证会话时出错:", error);
      setShowAccessButton(true);
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
          console.log("[受保护页面] 验证失败，但已显示临时访问按钮");
          // 不再立即跳转，而是显示临时访问按钮
          // router.push("/sign-in");
        } else if (mounted) {
          console.log("[受保护页面] 验证成功，用户可访问");
          setLoading(false);
        }
      } catch (error) {
        console.error("[受保护页面] 验证过程中出错:", error);
        if (mounted) {
          setShowAccessButton(true);
        }
      } finally {
        // 无论结果如何，5秒后关闭加载状态，避免用户被卡在加载屏幕
        if (mounted) {
          setTimeout(() => {
            setLoading(false);
          }, 5000);
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
    setShowAccessButton(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-4rem)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (showAccessButton) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">需要登录</h1>
          <p className="text-gray-600 mt-2">您需要登录才能访问此页面</p>
        </div>
        <Button onClick={() => router.push('/sign-in')} className="px-6 py-2">
          登录账户
        </Button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <main className="min-h-screen pt-6">
        <ResponsiveContainer padding="md" fullWidth={true}>
          {children}
        </ResponsiveContainer>
      </main>
    </div>
  );
} 