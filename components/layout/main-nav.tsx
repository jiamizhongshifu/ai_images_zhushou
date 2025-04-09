"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Edit3, History, HelpCircle, User, LogOut, LogIn, Gem } from "lucide-react";
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
  requiresAuth?: boolean;
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
  const [isInitialAuthLoading, setIsInitialAuthLoading] = useState(true);
  const supabase = createClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [authStateLocked, setAuthStateLocked] = useState(false);

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
    
    // 避免重复执行认证检查
    let isMounted = true;
    
    // 初始化时立即检查cookie状态
    const checkCookieAuth = () => {
      try {
        if (typeof window !== 'undefined' && document) {
          // 检查cookie中的认证标记
          const hasAuthCookie = document.cookie.includes('user_authenticated=true');
          if (hasAuthCookie) {
            console.log('[MainNav] 初始化 - 检测到认证cookie，设置为已登录状态');
            if (isMounted && !authStateLocked) {
              setIsAuthenticated(true);
              setAuthStateLocked(true); // 锁定状态，防止被错误覆盖
              
              // 立即获取积分信息
              fetchCredits();
            }
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error('[MainNav] 检查cookie出错:', error);
        return false;
      }
    };
    
    // 先检查URL参数是否指示强制登录状态
    const checkForceLoginParam = () => {
      try {
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          // 检查多种可能的登录参数
          const hasForceLoginParam = urlParams.has('force_login') || 
                                     urlParams.has('just_logged_in') ||
                                     urlParams.has('auth_time');
                                     
          if (hasForceLoginParam) {
            console.log('[MainNav] 检测到强制登录参数，设置为已登录状态');
            if (isMounted && !authStateLocked) {
              setIsAuthenticated(true);
              setAuthStateLocked(true);
              
              // 设置认证cookie
              document.cookie = 'user_authenticated=true; path=/; max-age=86400';
              localStorage.setItem('wasAuthenticated', 'true');
              sessionStorage.setItem('activeAuth', 'true');
              
              // 获取积分
              fetchCredits();
            }
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error('[MainNav] 检查URL参数出错:', error);
        return false;
      }
    };
    
    // 先检查URL参数，再检查cookie
    const isForceLogin = checkForceLoginParam();
    const isCookieAuthenticated = !isForceLogin && checkCookieAuth();
    
    // 优先使用传入的认证状态
    if (providedAuthState !== undefined && isMounted && !authStateLocked) {
      setIsAuthenticated(providedAuthState);
      setAuthStateLocked(providedAuthState); // 如果是true则锁定状态
      setIsInitialAuthLoading(false);
      
      // 如果被告知已登录，立即获取积分
      if (providedAuthState) {
        fetchCredits();
      }
    } else if (!isCookieAuthenticated && !isForceLogin && !authStateLocked) {
      // 只有当cookie和URL参数检查都没有成功时，才通过API检查
      checkAuthState();
    } else {
      // 否则已通过cookie或URL参数确认已登录
      setIsInitialAuthLoading(false);
    }
    
    // 添加额外的安全保障：检查localStorage中的登出标记
    const checkLogoutFlags = () => {
      try {
        if (typeof window !== 'undefined') {
          const forcedLogout = localStorage.getItem('force_logged_out') === 'true';
          const sessionLogout = sessionStorage.getItem('isLoggedOut') === 'true';
          
          // 如果检测到登出标记，强制设置为未登录状态
          if (forcedLogout || sessionLogout) {
            console.log('[MainNav] 检测到登出标记，强制设置为未登录状态');
            if (isMounted) {
              setIsAuthenticated(false);
              setAuthStateLocked(false); // 解锁状态允许将来更改
            }
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error('[MainNav] 检查登出标记出错:', error);
        return false;
      }
    };
    
    // 只有在没有被登出标记覆盖的情况下，才检查认证cookie
    const isLoggedOut = checkLogoutFlags();
    if (!isLoggedOut && typeof window !== 'undefined' && !authStateLocked) {
      // 检查cookie中的认证标记
      const hasAuthCookie = document.cookie.includes('user_authenticated=true');
      if (hasAuthCookie && isMounted) {
        console.log('[MainNav] 检测到用户认证cookie，设置为已登录状态');
        setIsAuthenticated(true);
        
        // 获取积分信息
        fetchCredits();
      }
    }
    
    // 添加会话状态变化监听
    const setupSessionListener = async () => {
      try {
        // 添加认证状态变化监听器
        const { data: { subscription } } = await supabase.auth.onAuthStateChange(
          (event, session) => {
            console.log(`[MainNav] 认证状态变化: ${event}`);
            
            // 如果检测到登出事件，允许状态变更
            if (event === 'SIGNED_OUT' && isMounted) {
              setAuthStateLocked(false);
              setIsAuthenticated(false);
              return;
            }
            
            // 对于其他事件，如果状态已锁定则不更改
            if (authStateLocked && event !== 'SIGNED_IN') {
              console.log(`[MainNav] 认证状态已锁定，忽略事件: ${event}`);
              return;
            }
            
            // 根据会话事件更新状态
            const newIsAuthenticated = !!session;
            
            if (newIsAuthenticated !== isAuthenticated && isMounted) {
              console.log(`[MainNav] 认证状态由 ${isAuthenticated} 变为 ${newIsAuthenticated}`);
              setIsAuthenticated(newIsAuthenticated);
              
              // 如果变为已登录，锁定状态
              if (newIsAuthenticated) {
                setAuthStateLocked(true);
              }
            }
            
            if (isMounted) {
              setUserEmail(session?.user?.email || null);
            }
            
            // 如果用户登录，尝试获取积分
            if (newIsAuthenticated && isMounted) {
              fetchCredits();
            }
          }
        );
        
        // 组件卸载时取消订阅
        return () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error('[MainNav] 设置认证状态监听器出错:', error);
      }
    };
    
    setupSessionListener();
    
    // 页面可见性变化时重新检查会话状态
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMounted) {
        console.log('[MainNav] 页面变为可见，重新检查认证状态');
        // 只检查cookie，避免不必要的API调用
        checkCookieAuth();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [providedAuthState, supabase, authStateLocked]);
  
  // 获取用户积分
  const fetchCredits = useCallback(async () => {
    try {
      console.log('[MainNav] fetchCredits: 尝试获取用户积分 (前提: 已认证)');
      const creditsResponse = await fetch('/api/credits/get', {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (creditsResponse.ok) {
        const creditsData = await creditsResponse.json();
        console.log('[MainNav] fetchCredits: API响应:', JSON.stringify(creditsData));
        if (creditsData.success && typeof creditsData.credits === 'number') {
          setCredits(creditsData.credits);
          console.log(`[MainNav] fetchCredits: 成功获取积分: ${creditsData.credits}`);
        } else {
          console.error('[MainNav] fetchCredits: 无法从响应中提取积分值，设为0');
          setCredits(0);
        }
      } else {
        console.error('[MainNav] fetchCredits: 获取积分失败:', creditsResponse.status);
        setCredits(0);
      }
    } catch (error) {
      console.error('[MainNav] fetchCredits: 获取积分异常:', error);
      setCredits(0);
    }
  }, []);
  
  // API检查认证状态
  const checkAuthState = useCallback(async (isInitialCheck = false) => {
    console.log(`[MainNav] checkAuthState: ${isInitialCheck ? '初始检查' : '后续检查'} Supabase会话...`);
    try {
      // **Always** check the Supabase session as the source of truth
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('[MainNav] checkAuthState: 获取会话失败:', error.message);
        // Treat session fetch error as logged out
        setIsAuthenticated(false);
        setAuthStateLocked(false);
        setCredits(null);
        return false; // Indicate logged out
      }

      const session = data?.session;
      const currentIsAuthenticated = !!session;
      console.log(`[MainNav] checkAuthState: 会话检查结果: ${currentIsAuthenticated ? '有效' : '无效'}`);

      // Update state based *only* on the session result
      setIsAuthenticated(currentIsAuthenticated);
      setUserEmail(session?.user?.email || null);
      setAuthStateLocked(currentIsAuthenticated); // Lock only if authenticated

      if (currentIsAuthenticated) {
        // Fetch credits only if session is valid
        fetchCredits();
        // Optionally set local markers if needed by other parts (use with caution)
        localStorage.setItem('wasAuthenticated', 'true');
      } else {
        // Clear credits and local markers if session is invalid
        setCredits(null);
        localStorage.removeItem('wasAuthenticated');
        document.cookie = 'user_authenticated=; path=/; max-age=0'; // Clear cookie too
      }
      return currentIsAuthenticated; // Return the definitive state

    } catch (error) {
      console.error('[MainNav] checkAuthState: 检查会话异常:', error);
      setIsAuthenticated(false);
      setAuthStateLocked(false);
      setCredits(null);
      return false; // Indicate logged out on exception
    } finally {
      // End initial loading only after the *initial* check is complete
      if (isInitialCheck) {
         console.log("[MainNav] checkAuthState: 初始检查完成，结束加载状态。");
         setIsInitialAuthLoading(false);
      }
    }
  }, [supabase, fetchCredits]);

  // 初次渲染和认证状态变化时检查
  useEffect(() => {
    setIsClient(true);
    let isMounted = true;

    console.log("[MainNav] useEffect: 开始执行初始加载和监听器设置");
    setIsInitialAuthLoading(true); // Start loading

    // **1. Absolute Priority: Check Logout Flags**
    let loggedOutByFlag = false;
    if (typeof document !== 'undefined') {
      const forceLoggedOut = localStorage.getItem('force_logged_out') === 'true';
      const isLoggedOut = sessionStorage.getItem('isLoggedOut') === 'true';
      if (forceLoggedOut || isLoggedOut) {
        console.log('[MainNav] useEffect: 检测到登出标记，强制设置为未登录状态');
        loggedOutByFlag = true;
        setIsAuthenticated(false);
        setAuthStateLocked(false);
        setCredits(null);
        localStorage.removeItem('force_logged_out');
        sessionStorage.removeItem('isLoggedOut');
        document.cookie = 'user_authenticated=; path=/; max-age=0'; // Clear cookie too
        localStorage.removeItem('wasAuthenticated'); // Clear other markers
        setIsInitialAuthLoading(false); // End loading immediately
      }
    }

    // **2. If not logged out by flag, perform initial session check**
    if (!loggedOutByFlag && isMounted) {
      console.log("[MainNav] useEffect: 未检测到登出标记，执行初始会话检查 (checkAuthState)");
      checkAuthState(true); // Pass true to indicate initial check
    }

    // **3. Setup Supabase Auth Listener for subsequent changes**
    console.log("[MainNav] useEffect: 设置Supabase onAuthStateChange监听器");
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) {
           console.log("[MainNav] onAuthStateChange: 组件已卸载，忽略事件:", event);
           return;
        }
        console.log(`[MainNav] onAuthStateChange: 事件: ${event}, 会话: ${session ? '存在' : '不存在'}`);
        const serverIsAuthenticated = !!session;

        // Only update if the state *actually* changes based on the event
        // Let checkAuthState handle the initial state setting
        if (serverIsAuthenticated !== isAuthenticated) {
             console.log(`[MainNav] onAuthStateChange: 服务端状态 (${serverIsAuthenticated}) 与当前 (${isAuthenticated}) 不同，触发 checkAuthState 进行权威更新`);
            // Re-run checkAuthState to get the most definitive state and handle side effects (like credits)
            // Avoid directly setting state here to prevent race conditions with initial check
             checkAuthState(false); // Pass false for subsequent checks
        } else {
             console.log(`[MainNav] onAuthStateChange: 服务端状态 (${serverIsAuthenticated}) 与当前 (${isAuthenticated}) 相同，无需操作`);
        }
        
         // Ensure loading finishes if somehow still true after an event
         if (isInitialAuthLoading) {
            console.warn("[MainNav] onAuthStateChange: 初始加载状态仍为true，强制结束");
            setIsInitialAuthLoading(false);
         }
      }
    );

    // Cleanup function
    return () => {
      console.log("[MainNav] useEffect: 清理函数执行，组件卸载");
      isMounted = false;
      if (subscription) {
        console.log("[MainNav] useEffect: 取消Supabase onAuthStateChange订阅");
        subscription.unsubscribe();
      } else {
        console.warn("[MainNav] useEffect: 无法取消订阅，subscription对象未定义？");
      }
    };
    // Dependencies: Only supabase client and the checkAuthState function itself
    // fetchCredits is called *by* checkAuthState, so it's an indirect dependency
  }, [supabase, checkAuthState]);

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
      // 使用window.location.href而非路由导航，避免状态保留问题
      window.location.href = `/sign-in?redirect=${returnUrl}`;
      return;
    }
    
    // 检查是否是当前页面
    if (pathname === item.href) {
      console.log(`[MainNav] 已在当前页面: ${item.name}`);
      return;
    }
    
    // 正常导航操作
    console.log(`[MainNav] 导航到: ${item.name} (${item.href})`);
    
    // 使用直接导航方式，不添加特殊参数
    // 对于所有导航，强制添加认证cookie标记
    document.cookie = 'user_authenticated=true; path=/; max-age=86400';
    localStorage.setItem('wasAuthenticated', 'true');
    
    // 特殊处理受保护的页面，确保多重认证标记
    if (item.requiresAuth) {
      // 设置多个不同的标记，以增加可靠性
      sessionStorage.setItem('activeAuth', 'true');
      // 设置强制标记，防止导航过程中状态丢失
      const currentUrl = new URL(item.href, window.location.origin);
      // 添加认证参数
      currentUrl.searchParams.append('force_login', 'true');
      currentUrl.searchParams.append('auth_time', Date.now().toString());
      
      // 使用带参数的URL进行跳转
      window.location.href = currentUrl.toString();
    } else {
      // 对非受保护页面，使用标准跳转
      window.location.href = item.href;
    }
  };

  // 处理登录按钮点击
  const handleLoginClick = () => {
    // 清除登出标记，以防有残留
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('force_logged_out');
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('isLoggedOut');
    }
    
    // 获取当前路径作为重定向目标
    const currentPath = window.location.pathname;
    
    // 使用直接导航而非路由导航
    if (currentPath === '/sign-in') {
      window.location.href = '/sign-in';
      return;
    }
    
    // 如果当前路径是受保护页面或其他希望登录后返回的页面，添加重定向参数
    if (currentPath !== '/') {
      window.location.href = `/sign-in?redirect=${encodeURIComponent(currentPath)}`;
    } else {
      // 否则直接前往登录页
      window.location.href = '/sign-in';
    }
  };

  // 处理登出按钮点击
  const handleLogout = async () => {
    console.log("[MainNav] handleLogout: 开始执行登出...");
    try {
      setIsSigningOut(true);
      
      // **1. Set logout flags FIRST** (Crucial)
      localStorage.setItem('force_logged_out', 'true');
      sessionStorage.setItem('isLoggedOut', 'true');
      console.log("[MainNav] handleLogout: 已设置登出标记 (localStorage & sessionStorage)");

      // 2. Clear local state immediately for UI responsiveness
      setIsAuthenticated(false);
      setAuthStateLocked(false);
      setCredits(null);
      console.log("[MainNav] handleLogout: 已清除本地认证状态和积分");

      // 3. Call Supabase signout (Best effort, might fail but flags are set)
      console.log("[MainNav] handleLogout: 调用Supabase API signOut...");
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[MainNav] handleLogout: Supabase API登出错误:', error);
        // Don't stop the rest of the cleanup even if API fails
      }
      
      // 4. Clear other auth service state and cookies (redundant but safe)
      console.log("[MainNav] handleLogout: 清理authService状态和Cookies...");
      clearAuthState(); // Assuming this clears its internal state
      const cookieNames = ['sb-access-token', 'sb-refresh-token', '__session', 'sb-refresh-token-nonce', 'user_authenticated', 'sb-session-recovery', 'manualAuth'];
      const commonOptions = '; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      cookieNames.forEach(cookieName => {
        document.cookie = `${cookieName}=${commonOptions}`;
        try { // Be defensive about hostname access
          const domainParts = window.location.hostname.split('.');
          if (domainParts.length > 1) {
            const rootDomain = domainParts.slice(-2).join('.');
            document.cookie = `${cookieName}=${commonOptions}; domain=.${rootDomain}`;
          }
          document.cookie = `${cookieName}=${commonOptions}; domain=${window.location.hostname}`;
        } catch (e) { console.warn("Cookie clear domain error:", e);}
      });
      const keysToRemove = ['supabase.auth.token', 'supabase.auth.expires_at', 'auth_state', 'auth_valid', 'auth_time', 'wasAuthenticated', 'activeAuth'];
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log("[MainNav] handleLogout: 清理完成");

      // 5. Redirect (Logout flags are set, so next load *should* detect them)
      console.log("[MainNav] handleLogout: 重定向到首页...");
      window.location.href = '/?logout=true'; // Use simple param, flags handle state
      
    } catch (error) {
      console.error('[MainNav] handleLogout: 登出过程中发生异常:', error);
      // Ensure UI reflects logout even on error
      setIsAuthenticated(false);
      setAuthStateLocked(false);
      setCredits(null);
      alert("退出登录时发生错误，但已尝试清除本地状态。");
    } finally {
      setIsSigningOut(false);
    }
  };

  // 导航处理函数
  const handleNavigation = async (href: string, target?: string) => {
    // 对于外部链接或指定target的链接，使用默认行为
    if (target || href.startsWith('http')) {
      return;
    }
    
    // 对于创作页和历史页，检查认证状态
    if ((href === '/create' || href === '/history') && !isAuthenticated) {
      console.log(`[MainNav] 未认证用户尝试访问 ${href}，重定向到登录页`);
      // 使用window.location而非router，确保状态清理
      window.location.href = `/sign-in?next=${encodeURIComponent(href)}`;
      return;
    }
    
    // 根据不同页面使用不同导航方式
    if (href === '/sign-in' || href === '/create' || href === '/history') {
      // 使用window.location确保完全刷新页面状态
      console.log(`[MainNav] 使用硬跳转导航到: ${href}`);
      window.location.href = href;
    } else {
      // 其他页面使用router导航
      console.log(`[MainNav] 使用路由导航到: ${href}`);
      router.push(href);
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
      
      {/* 用户信息区域 - 根据初始加载和认证状态显示 */}
      <div className="flex items-center gap-2 w-full md:w-auto justify-end ml-auto md:ml-0 mt-2 md:mt-0">
        {isInitialAuthLoading ? (
          <div className="h-8 w-20 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-md"></div>
        ) : isAuthenticated ? (
          <>
            <UserCreditDisplay className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md" />
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