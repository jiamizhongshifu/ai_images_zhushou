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
  const supabase = createClient();

  useEffect(() => {
    // 标记为客户端环境
    setIsClient(true);
    
    // 验证用户登录状态
    const checkUser = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setIsAuthenticated(data.session?.user !== null);
        setIsLoading(false);
      } catch (error) {
        console.error('验证用户状态出错:', error);
        setIsLoading(false);
      }
    };
    
    checkUser();
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