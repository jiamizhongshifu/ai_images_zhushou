"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MainNav } from "@/components/layout/main-nav";
import { SiteLogo } from "@/components/layout/site-logo";
import { authService } from "@/utils/auth-service";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

export function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = await createClient();

  useEffect(() => {
    // 标记为客户端环境
    setIsClient(true);
    
    // 初始化时检查认证状态
    const checkAuthState = async () => {
      setIsLoading(true);
      
      try {
        // 1. 首先检查AuthService中的缓存状态
        const cachedAuthState = authService.isAuthenticated();
        
        // 2. 如果缓存无效，直接从Supabase检查会话
        if (!cachedAuthState) {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error("[Navbar] 获取会话失败:", error.message);
          } else if (data && data.session) {
            console.log("[Navbar] 从Supabase直接检测到有效会话");
            // 强制更新AuthService状态并设置本地状态
            authService.manualAuthenticate();
            setIsAuthenticated(true);
          } else {
            console.log("[Navbar] Supabase会话检查结果: 未登录");
            setIsAuthenticated(false);
          }
        } else {
          console.log("[Navbar] 使用缓存的认证状态: 已登录");
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error("[Navbar] 检查认证状态时出错:", error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    // 执行初始检查
    checkAuthState();
    
    // 订阅认证状态变化
    const unsubscribe = authService.subscribe((authState) => {
      console.log("[Navbar] 收到认证状态更新:", authState.isAuthenticated);
      setIsAuthenticated(authState.isAuthenticated);
    });

    // 监听Supabase身份验证状态变化
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[Navbar] Supabase Auth Event: ${event}`);
      if (event === 'SIGNED_IN' && session) {
        console.log("[Navbar] 用户已登录");
        setIsAuthenticated(true);
      } else if (event === 'SIGNED_OUT') {
        console.log("[Navbar] 用户已登出");
        setIsAuthenticated(false);
      }
    });
    
    // 添加窗口大小变化监听，在大屏幕上自动关闭移动菜单
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      unsubscribe(); // 清理认证订阅
      window.removeEventListener('resize', handleResize); // 清理窗口大小监听
      authListener.subscription.unsubscribe(); // 清理Supabase认证监听
    };
  }, [supabase]);

  // 处理登录按钮点击
  const handleLoginClick = () => {
    // 清除登出标记，以防有残留
    localStorage.removeItem('force_logged_out');
    sessionStorage.removeItem('isLoggedOut');
    
    // 获取当前路径作为重定向目标
    const currentPath = window.location.pathname;
    const isProtectedPath = currentPath.startsWith('/protected');
    
    // 如果当前已在登录页，则不添加重定向参数
    if (currentPath === '/sign-in') {
      window.location.href = "/sign-in";
      return;
    }
    
    // 如果当前路径是受保护页面或其他希望登录后返回的页面，添加重定向参数
    if (isProtectedPath || currentPath !== '/') {
      window.location.href = `/sign-in?redirect=${encodeURIComponent(currentPath)}`;
    } else {
      // 否则直接前往登录页
      window.location.href = "/sign-in";
    }
  };

  // 仅在客户端渲染导航栏
  if (!isClient) {
    // 返回一个占位导航栏，避免布局移动
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex h-8 w-28 animate-pulse rounded bg-muted"></div>
          <div className="flex h-8 w-48 animate-pulse rounded bg-muted"></div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        {/* 网站Logo */}
        <SiteLogo />

        {/* 移动端汉堡菜单按钮 */}
        <button
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none md:hidden"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
          <span className="sr-only">切换菜单</span>
        </button>

        {/* 桌面端导航 */}
        <div className="hidden md:flex md:flex-1 md:items-center md:justify-between">
          {/* 将isAuthenticated状态传递给MainNav组件 */}
          <MainNav providedAuthState={isAuthenticated} />
        </div>

        {/* 移动端菜单 */}
        <div className={cn(
          "fixed inset-0 top-14 z-50 flex flex-col bg-background md:hidden",
          isMobileMenuOpen ? "animate-in fade-in-0 slide-in-from-top-5" : "hidden"
        )}>
          <div className="px-4 py-6 flex flex-col">
            <MainNav providedAuthState={isAuthenticated} />
          </div>
        </div>
      </div>
    </header>
  );
} 