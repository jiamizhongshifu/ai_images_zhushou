"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Edit3, History, HelpCircle, User, LogOut, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { authService, clearAuthState } from "@/utils/auth-service";
import { createClient } from "@/utils/supabase/client";
import UserCreditDisplay from "@/components/user-credit-display";

// 导航项定义
type NavItem = {
  name: string;
  href: string;
  icon: React.ReactNode;
  requiresAuth: boolean;
};

// 组件属性类型
interface MainNavProps {
  providedAuthState?: boolean; // 父组件可以提供认证状态
}

export function MainNav({ providedAuthState }: MainNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();
  const [isSigningOut, setIsSigningOut] = useState(false);

  // 导航项配置
  const navItems: NavItem[] = [
    {
      name: "创作",
      href: "/protected",
      icon: <Edit3 className="h-4 w-4 mr-2" />,
      requiresAuth: true,
    },
    {
      name: "历史",
      href: "/protected/history",
      icon: <History className="h-4 w-4 mr-2" />,
      requiresAuth: true,
    },
    {
      name: "问答",
      href: "/qa",
      icon: <HelpCircle className="h-4 w-4 mr-2" />,
      requiresAuth: false,
    },
  ];

  useEffect(() => {
    setIsClient(true);
    
    // 优先使用传入的认证状态
    if (providedAuthState !== undefined) {
      setIsAuthenticated(providedAuthState);
      setIsLoading(false);
    } else {
      // 如果没有提供状态，则自行检查
      checkAuth();
    }
  }, [providedAuthState]);
  
  const checkAuth = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      
      setIsAuthenticated(!!user);
      setUserEmail(user?.email || null);
      
      if (user) {
        // 获取用户积分信息
        try {
          const creditsResponse = await fetch('/api/credits/get');
          if (creditsResponse.ok) {
            const creditsData = await creditsResponse.json();
            setCredits(creditsData.availableCredits || 0);
          }
        } catch (error) {
          console.error('获取积分信息失败:', error);
        }
      }
    } catch (error) {
      console.error('验证用户状态失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理导航项点击
  const handleNavClick = (e: React.MouseEvent, item: NavItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 如果需要认证但未登录
    if (item.requiresAuth && !isAuthenticated) {
      console.log(`[MainNav] 用户未登录，点击了需要认证的导航项: ${item.name}`);
      
      // 清除任何可能的登出标记
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('force_logged_out');
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('isLoggedOut');
      }
      
      // 重定向到登录页，带上返回URL
      const returnUrl = encodeURIComponent(item.href);
      window.location.href = `/sign-in?redirect=${returnUrl}`;
      return;
    }
    
    // 检查是否是当前页面
    if (pathname === item.href) {
      console.log(`[MainNav] 已在当前页面: ${item.name}`);
      return;
    }
    
    // 正常导航操作 - 使用 router.push 避免默认行为和中间件循环
    console.log(`[MainNav] 导航到: ${item.name} (${item.href})`);
    
    // 对于受保护页面，添加特殊标记以避免中间件重定向循环
    if (item.href.startsWith('/protected')) {
      const url = new URL(item.href, window.location.origin);
      url.searchParams.set('nav_direct', 'true');
      router.push(url.pathname + url.search);
    } else {
      router.push(item.href);
    }
  };

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
      router.push("/sign-in");
      return;
    }
    
    // 如果当前路径是受保护页面或其他希望登录后返回的页面，添加重定向参数
    if (isProtectedPath || currentPath !== '/') {
      router.push(`/sign-in?redirect=${encodeURIComponent(currentPath)}`);
    } else {
      // 否则直接前往登录页
      router.push("/sign-in");
    }
  };

  // 处理登出按钮点击
  const handleLogout = async () => {
    try {
      setIsSigningOut(true);
      
      // 记录登出意图到localStorage，使其在页面跳转后仍然有效
      localStorage.setItem('force_logged_out', 'true');
      
      // 先执行Supabase API登出
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Supabase API登出错误:', error);
      }
      
      // 清除认证服务状态
      clearAuthState();
      
      // 手动清除所有可能的Cookie
      const cookieNames = ['sb-access-token', 'sb-refresh-token', '__session', 'sb-refresh-token-nonce'];
      const commonOptions = '; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      
      cookieNames.forEach(cookieName => {
        // 清除默认域下的cookie
        document.cookie = `${cookieName}=${commonOptions}`;
        // 清除当前域下的cookie
        document.cookie = `${cookieName}=${commonOptions}; domain=${window.location.hostname}`;
        
        // 尝试在根域上清除
        const domainParts = window.location.hostname.split('.');
        if (domainParts.length > 1) {
          const rootDomain = domainParts.slice(domainParts.length - 2).join('.');
          document.cookie = `${cookieName}=${commonOptions}; domain=.${rootDomain}`;
        }
      });
      
      // 清除localStorage中所有可能的认证数据
      const keysToRemove = [
        'supabase.auth.token',
        'supabase.auth.expires_at',
        'auth_state',
        'auth_valid',
        'auth_time',
        'wasAuthenticated'
      ];
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // 将登出状态保存到sessionStorage
      sessionStorage.setItem('isLoggedOut', 'true');
      
      // 添加特殊参数防止中间件重定向
      router.push('/?force_logout=true');
      
      console.log('登出操作完成, 页面将重定向到首页');
    } catch (error) {
      console.error('登出过程中发生错误:', error);
      alert("退出登录时发生错误");
    } finally {
      setIsSigningOut(false);
    }
  };

  // 仅在客户端渲染导航栏
  if (!isClient) {
    return null;
  }

  return (
    <nav className="flex items-center w-full justify-between flex-wrap md:flex-nowrap">
      {/* 留出左侧空间，导航项居中 */}
      <div className="hidden md:block w-0 md:w-auto"></div>
      
      {/* 导航项居中显示 */}
      <div className="flex items-center gap-3 justify-center mx-auto flex-wrap">
        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={(e) => handleNavClick(e, item)}
            className={cn(
              buttonVariants({
                variant: pathname === item.href ? "secondary" : "ghost",
                size: "sm",
              }),
              "flex items-center gap-1 my-1",
              item.requiresAuth && !isAuthenticated ? "opacity-80" : ""
            )}
          >
            {item.icon}
            <span>{item.name}</span>
          </button>
        ))}
      </div>
      
      {/* 用户信息区域 - 根据登录状态显示不同内容 */}
      <div className="flex items-center gap-2 w-full md:w-auto justify-end ml-auto md:ml-0 mt-2 md:mt-0">
        {isAuthenticated ? (
          <>
            <UserCreditDisplay />
            <div className="h-4 w-px bg-gray-300 dark:bg-gray-700 mx-1" />
            <button
              onClick={handleLogout}
              className={cn(
                buttonVariants({
                  variant: "ghost",
                  size: "sm",
                }),
                "flex items-center gap-1"
              )}
              disabled={isSigningOut}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{isSigningOut ? "退出中..." : "退出"}</span>
            </button>
          </>
        ) : (
          <button
            onClick={handleLoginClick}
            className={cn(
              buttonVariants({
                variant: "outline",
                size: "sm",
              }),
              "flex items-center gap-1"
            )}
          >
            <LogIn className="h-4 w-4" />
            <span>登录</span>
          </button>
        )}
      </div>
    </nav>
  );
} 