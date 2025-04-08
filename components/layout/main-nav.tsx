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
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  // 添加锁定标志，防止重复状态切换
  const [authStateLocked, setAuthStateLocked] = useState(false);
  // 添加防抖状态，避免重复检查认证
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  // 认证状态来源跟踪
  const authSourceRef = useRef<string>('initial');
  // 添加上次检查认证的时间戳
  const lastAuthCheckRef = useRef<number>(0);
  // 标记是否已进行过初始检查
  const initialCheckDoneRef = useRef<boolean>(false);

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
      setIsLoading(false);
      
      // 如果被告知已登录，立即获取积分
      if (providedAuthState) {
        fetchCredits();
      }
    } else if (!isCookieAuthenticated && !isForceLogin && !authStateLocked) {
      // 只有当cookie和URL参数检查都没有成功时，才通过API检查
      checkAuthState();
    } else {
      // 否则已通过cookie或URL参数确认已登录
      setIsLoading(false);
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
      console.log('[MainNav] 尝试获取用户积分');
      
      // 如果未认证，不获取积分
      if (!isAuthenticated) {
        console.log('[MainNav] 用户未认证，跳过积分获取');
        return;
      }
      
      // 强制添加认证标记，确保API调用成功
      if (typeof document !== 'undefined') {
        document.cookie = 'user_authenticated=true; path=/; max-age=86400';
      }
      
      const creditsResponse = await fetch('/api/credits/get', {
        // 添加缓存控制头，避免缓存干扰
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (creditsResponse.ok) {
        const creditsData = await creditsResponse.json();
        
        // 输出完整响应结构以便调试
        console.log('[MainNav] 积分API完整响应:', JSON.stringify(creditsData));
        
        // 检查响应是否为成功
        if (creditsData && creditsData.success === true) {
          // 直接使用API返回的标准字段
          if (typeof creditsData.credits === 'number') {
            setCredits(creditsData.credits);
            console.log(`[MainNav] 成功获取积分: ${creditsData.credits}`);
            return;
          }
        }
        
        // 处理多种可能的API响应格式
        let creditsValue = null;
        
        // 尝试不同的可能字段名
        if (creditsData && typeof creditsData.availableCredits === 'number') {
          creditsValue = creditsData.availableCredits;
        } else if (creditsData && typeof creditsData.credits === 'number') {
          creditsValue = creditsData.credits;
        } else if (creditsData && typeof creditsData.balance === 'number') {
          creditsValue = creditsData.balance;
        } else if (creditsData && typeof creditsData.amount === 'number') {
          creditsValue = creditsData.amount;
        } else if (creditsData && typeof creditsData.value === 'number') {
          creditsValue = creditsData.value;
        } else if (creditsData && typeof creditsData.data === 'object' && creditsData.data) {
          // 尝试从data对象中获取
          const dataObj = creditsData.data;
          if (typeof dataObj.credits === 'number') {
            creditsValue = dataObj.credits;
          } else if (typeof dataObj.availableCredits === 'number') {
            creditsValue = dataObj.availableCredits;
          }
        }
        
        if (creditsValue !== null) {
          setCredits(creditsValue);
          console.log(`[MainNav] 成功获取积分: ${creditsValue}`);
        } else {
          console.error('[MainNav] 无法从响应中提取积分值，使用默认值0');
          // 设置默认值为0
          setCredits(0);
        }
      } else {
        console.error('[MainNav] 获取积分失败:', creditsResponse.status);
        // 设置默认值为0
        setCredits(0);
      }
    } catch (error) {
      console.error('[MainNav] 获取积分信息异常:', error);
      // 设置默认值为0
      setCredits(0);
    }
  }, [isAuthenticated]);
  
  // API检查认证状态
  const checkAuthState = async () => {
    try {
      // 避免在状态锁定时进行检查
      if (authStateLocked) {
        console.log('[MainNav] 认证状态已锁定，跳过API检查');
        return;
      }
      
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      
      setIsAuthenticated(!!user);
      setUserEmail(user?.email || null);
      
      if (user) {
        // 设置认证cookie
        document.cookie = 'user_authenticated=true; path=/; max-age=86400';
        localStorage.setItem('wasAuthenticated', 'true');
        setAuthStateLocked(true); // 锁定状态
        
        // 获取用户积分信息
        fetchCredits();
      }
    } catch (error) {
      console.error('[MainNav] 验证用户状态失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 初次渲染和认证状态变化时检查
  useEffect(() => {
    // 本地检查认证状态
    const performAuthCheck = () => {
      console.log('[MainNav] 执行认证状态检查');
      
      // 避免在锁定状态下执行
      if (authStateLocked) {
        console.log('[MainNav] 认证状态已锁定，跳过检查');
        return;
      }
      
      // 检查各种认证标记
      if (typeof document !== 'undefined') {
        const hasAuthCookie = document.cookie.includes('user_authenticated=true');
        const hasLocalAuth = localStorage.getItem('wasAuthenticated') === 'true';
        const hasSessionAuth = sessionStorage.getItem('activeAuth') === 'true';
        
        // 如果有任何一个认证标记，设置为已认证状态
        if (hasAuthCookie || hasLocalAuth || hasSessionAuth) {
          console.log('[MainNav] 检测到认证标记，设置为已登录状态');
          setIsAuthenticated(true);
        } else {
          // 尝试通过API检查认证状态
          checkAuthState();
        }
      }
    };
    
    // 执行认证检查
    performAuthCheck();
    
    // 当认证状态变化时，更新积分
    if (isAuthenticated) {
      fetchCredits();
    } else {
      // 未认证时重置积分
      setCredits(null);
    }
  }, [isAuthenticated, fetchCredits, authStateLocked, checkAuthState]);

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
    try {
      setIsSigningOut(true);
      
      // 解除认证状态锁定
      setAuthStateLocked(false);
      
      // 记录登出意图到localStorage，使其在页面跳转后仍然有效
      localStorage.setItem('force_logged_out', 'true');
      
      // 先执行Supabase API登出
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[MainNav] Supabase API登出错误:', error);
      }
      
      // 清除认证服务状态
      clearAuthState();
      
      // 手动清除所有可能的Cookie
      const cookieNames = [
        'sb-access-token', 
        'sb-refresh-token', 
        '__session', 
        'sb-refresh-token-nonce',
        'user_authenticated'
      ];
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
      
      // 直接跳转到首页，不使用路由导航
      window.location.href = '/?force_logout=true';
      
      console.log('[MainNav] 登出操作完成, 页面将重定向到首页');
    } catch (error) {
      console.error('[MainNav] 登出过程中发生错误:', error);
      alert("退出登录时发生错误");
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
      
      {/* 用户信息区域 - 根据登录状态显示不同内容，强制显示不依赖于子组件 */}
      <div className="flex items-center gap-2 w-full md:w-auto justify-end ml-auto md:ml-0 mt-2 md:mt-0">
        {isAuthenticated ? (
          <>
            {/* 积分显示部分 - 确保一直显示 */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
              <Gem className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">
                {credits !== null ? `${credits}点` : '0点'}
              </span>
            </div>
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