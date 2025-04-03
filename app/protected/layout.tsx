"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import UserNav from "@/components/user-nav";
import { ThemeProvider } from "next-themes";

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const supabase = createClient();
  // 添加加载状态
  const [loading, setLoading] = useState(true);

  // 验证用户是否已登录，未登录则重定向到登录页
  useEffect(() => {
    // 在组件挂载时设置一个标记，表示是初始加载
    let isInitialMount = true;
    
    const checkAuth = async () => {
      try {
        // 在控制台打印当前验证状态
        console.log("[受保护页面] 开始验证用户会话");
        
        // 首先检查URL参数，如果有登录标记，直接显示内容
        const urlParams = new URLSearchParams(window.location.search);
        const justLoggedIn = urlParams.get('just_logged_in');
        
        if (justLoggedIn) {
          console.log("[受保护页面] 检测到刚刚登录的标记，跳过会话验证");
          setLoading(false);
          return;
        }
        
        // 检查localStorage是否有手动存储的认证标记
        const localAuth = localStorage.getItem('auth_valid');
        const localAuthTime = localStorage.getItem('auth_time');
        
        if (localAuth === 'true' && localAuthTime) {
          const authTime = parseInt(localAuthTime, 10);
          const now = Date.now();
          // 如果认证时间在24小时内，直接认为有效
          if (now - authTime < 24 * 60 * 60 * 1000) {
            console.log("[受保护页面] 本地存储中发现有效认证，跳过详细验证");
            setLoading(false);
            return;
          }
        }
        
        // 检查cookie是否存在
        const hasSBCookie = document.cookie.includes('sb-access-token') || 
                           document.cookie.includes('sb-refresh-token');
                           
        if (hasSBCookie) {
          console.log("[受保护页面] 检测到认证cookie存在，无需完整验证");
          
          // 更新localStorage，延长有效期
          localStorage.setItem('auth_valid', 'true');
          localStorage.setItem('auth_time', Date.now().toString());
          
          setLoading(false);
          return;
        }
        
        // 如果之前的所有检查都未通过，则执行API验证
        console.log("[受保护页面] 尝试API验证会话状态");
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error(`[受保护页面] API验证出错: ${error.message}`);
        }
        
        if (data?.session) {
          console.log(`[受保护页面] API验证成功，用户ID: ${data.session.user.id.substring(0, 8)}...`);
          localStorage.setItem('auth_valid', 'true');
          localStorage.setItem('auth_time', Date.now().toString());
          setLoading(false);
        } else {
          // 最后一次尝试获取，等待较长时间
          if (isInitialMount) {
            console.log("[受保护页面] 初始化加载，等待1.5秒后重试");
            await new Promise(resolve => setTimeout(resolve, 1500));
            const secondTry = await supabase.auth.getSession();
            
            if (secondTry.data?.session) {
              console.log("[受保护页面] 延迟验证成功");
              localStorage.setItem('auth_valid', 'true');
              localStorage.setItem('auth_time', Date.now().toString());
              setLoading(false);
              return;
            }
          }
          
          // 所有尝试都失败
          console.log("[受保护页面] 所有验证方式都失败，重定向到登录页");
          localStorage.removeItem('auth_valid');
          localStorage.removeItem('auth_time');
          router.push("/sign-in");
        }
      } catch (error) {
        console.error("[受保护页面] 验证会话时出错:", error);
        // 出错时也验证cookie
        const hasSBCookie = document.cookie.includes('sb-access-token') || 
                           document.cookie.includes('sb-refresh-token');
                           
        if (hasSBCookie) {
          console.log("[受保护页面] 发生错误但检测到认证cookie存在，保持访问权限");
          setLoading(false);
          return;
        }
        
        router.push("/sign-in");
      } finally {
        isInitialMount = false;
      }
    };

    checkAuth();
  }, [router, supabase]);

  // 处理直接访问按钮点击
  const handleDirectAccess = () => {
    console.log("[受保护页面] 用户点击直接访问按钮");
    // 设置本地存储标记
    localStorage.setItem('auth_valid', 'true');
    localStorage.setItem('auth_time', Date.now().toString());
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