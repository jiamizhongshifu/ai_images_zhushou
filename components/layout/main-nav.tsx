"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Edit3, History, HelpCircle, User, LogOut, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { authService, clearAuthState } from "@/utils/auth-service";
import { createClient } from "@/utils/supabase/client";
import UserCreditDisplay from "@/components/user-credit-display";
import { UserIcon, Sparkles, ChatBubbleLeftEllipsisIcon, ClockIcon, ArrowRightOnRectangleIcon, CreditCardIcon } from '@heroicons/react/24/solid';
import Image from "next/image";
import userImage from "../../app/icon.png";
import { ModeToggle } from '@/components/toggle-theme';
import getUserIdentity from '@/lib/getUserIdentity';
import { HTMLAttributeAnchorTarget } from 'react';

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
          const hasForceLoginParam = window.location.search.includes('force_login=true') || 
                                     window.location.search.includes('just_logged_in=true');
          if (hasForceLoginParam) {
            console.log('[MainNav] 检测到强制登录参数，设置为已登录状态');
            if (isMounted && !authStateLocked) {
              setIsAuthenticated(true);
              setAuthStateLocked(true);
              
              // 设置认证cookie
              document.cookie = 'user_authenticated=true; path=/; max-age=86400';
              localStorage.setItem('wasAuthenticated', 'true');
              
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
      checkAuth();
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
  const fetchCredits = async () => {
    try {
      console.log('[MainNav] 尝试获取用户积分');
      
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
        console.log(`[MainNav] 积分API响应:`, creditsData);
        
        if (creditsData && typeof creditsData.availableCredits === 'number') {
          setCredits(creditsData.availableCredits);
          console.log(`[MainNav] 成功获取积分: ${creditsData.availableCredits}`);
        } else {
          console.error('[MainNav] 积分数据格式错误:', creditsData);
          // 如果有前一次有效值，保留它
          setCredits(prev => prev !== null ? prev : 0);
        }
      } else {
        console.error('[MainNav] 获取积分失败:', creditsResponse.status);
        // 如果API失败，至少显示一个默认值
        setCredits(prev => prev !== null ? prev : 0);
      }
    } catch (error) {
      console.error('[MainNav] 获取积分信息异常:', error);
      // 出错时至少显示默认值
      setCredits(prev => prev !== null ? prev : 0);
    }
  };
  
  const checkAuth = async () => {
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
        try {
          const creditsResponse = await fetch('/api/credits/get', {
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          
          if (creditsResponse.ok) {
            const creditsData = await creditsResponse.json();
            if (creditsData && typeof creditsData.availableCredits === 'number') {
              setCredits(creditsData.availableCredits);
            } else {
              // 保持当前值或设置默认值
              setCredits(prev => prev !== null ? prev : 0);
            }
          } else {
            console.error('[MainNav] 获取积分失败:', creditsResponse.status);
            // 设置默认值
            setCredits(prev => prev !== null ? prev : 0);
          }
        } catch (error) {
          console.error('[MainNav] 获取积分信息失败:', error);
          // 设置默认值
          setCredits(prev => prev !== null ? prev : 0);
        }
      }
    } catch (error) {
      console.error('[MainNav] 验证用户状态失败:', error);
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
    
    // 对所有导航都使用直接跳转，避免Next.js路由系统的问题
    window.location.href = item.href;
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

  // 检查认证状态的综合函数
  const checkAuth = async (source: string = 'unknown') => {
    // 如果认证状态已锁定，则不再检查
    if (authStateLocked) {
      console.log(`[MainNav] 认证状态已锁定，跳过检查，来源: ${source}`);
      return;
    }
    
    // 防止过于频繁的检查 (1秒内)
    const now = Date.now();
    if (now - lastAuthCheckRef.current < 1000) {
      console.log(`[MainNav] 检查过于频繁，跳过，来源: ${source}`);
      return;
    }
    lastAuthCheckRef.current = now;
    
    // 避免并发检查
    if (isCheckingAuth) {
      console.log(`[MainNav] 已有检查在进行中，跳过，来源: ${source}`);
      return;
    }
    
    try {
      setIsCheckingAuth(true);
      authSourceRef.current = source;
      console.log(`[MainNav] 开始检查认证状态，来源: ${source}`);
      
      // 检查登出标记
      const forcedLogout = localStorage.getItem('force_logged_out') === 'true' ||
                           sessionStorage.getItem('isLoggedOut') === 'true';
      
      if (forcedLogout) {
        console.log(`[MainNav] 检测到强制登出标记，设置为未认证`);
        const previousAuth = isAuthenticated;
        if (previousAuth) {
          setIsAuthenticated(false);
          setCredits(null);
          console.log(`[MainNav] 认证状态由 ${previousAuth} 变为 false，原因: 强制登出标记`);
        }
        return;
      }
      
      // 1. 检查cookie
      const cookies = document.cookie.split(';');
      const userAuthCookie = cookies.find(cookie => cookie.trim().startsWith('user_authenticated='));
      const hasAuthCookie = userAuthCookie && userAuthCookie.includes('true');
      
      // 2. 检查localStorage
      const wasAuthenticated = localStorage.getItem('wasAuthenticated') === 'true';
      
      // 3. 检查URL参数 (处理回调情况)
      const urlHasCode = window.location.href.includes('code=') && window.location.href.includes('next=');
      
      // 4. 检查Supabase会话
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const hasSession = !!session;
      
      console.log(`[MainNav] 认证检查结果 - Cookie: ${hasAuthCookie}, 本地存储: ${wasAuthenticated}, URL参数: ${urlHasCode}, 会话: ${hasSession}`);
      
      // 综合判断认证状态: 任何一个为true即认为已认证
      const newAuthState = hasAuthCookie || wasAuthenticated || urlHasCode || hasSession;
      
      // 如果状态要发生变化，记录日志
      if (isAuthenticated !== newAuthState) {
        console.log(`[MainNav] 认证状态由 ${isAuthenticated} 变为 ${newAuthState}，来源: ${source}`);
        
        // 如果是第一次初始化检查就直接设置
        if (!initialCheckDoneRef.current) {
          setIsAuthenticated(newAuthState);
          if (newAuthState) {
            // 获取积分信息
            fetchCredits();
          } else {
            setCredits(null);
          }
        } 
        // 如果从登录页完成登录，直接接受新状态
        else if (pathname === '/sign-in' && newAuthState === true) {
          setIsAuthenticated(true);
          fetchCredits();
        }
        // 如果明确触发了登出，直接接受新状态
        else if (source === 'logout' && newAuthState === false) {
          setIsAuthenticated(false);
          setCredits(null);
        }
        // 其他情况，如果要从认证状态变为未认证，再次确认
        else if (isAuthenticated && !newAuthState) {
          // 再次确认会话状态
          const { data: { session: recheck } } = await supabase.auth.getSession();
          if (recheck) {
            console.log(`[MainNav] 二次检查发现有效会话，保持认证状态`);
            // 修正回认证状态，并刷新cookie
            document.cookie = 'user_authenticated=true; path=/; max-age=604800';
            localStorage.setItem('wasAuthenticated', 'true');
            // 不改变状态
          } else {
            console.log(`[MainNav] 二次检查确认未认证，更新状态`);
            setIsAuthenticated(false);
            setCredits(null);
          }
        }
        // 从未认证变为认证状态，接受新状态
        else if (!isAuthenticated && newAuthState) {
          setIsAuthenticated(true);
          fetchCredits();
        }
      } else {
        // 状态一致，可能需要刷新积分
        if (newAuthState && credits === null) {
          fetchCredits();
        }
      }
      
      initialCheckDoneRef.current = true;
      
    } catch (error) {
      console.error(`[MainNav] 检查认证状态出错，来源: ${source}:`, error);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  // 导航处理函数
  const handleNavigation = async (href: string, target?: HTMLAttributeAnchorTarget) => {
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

  // 初始化时检查认证状态
  useEffect(() => {
    // 初始化检查
    checkAuth('init');
    
    // 监听导航结束事件
    const handleRouteChange = () => {
      console.log('[MainNav] 路由变化，检查认证状态');
      checkAuth('route-change');
    };
    
    // 周期性检查认证状态 (每分钟)
    const intervalId = setInterval(() => {
      checkAuth('interval');
    }, 60000);
    
    // 页面可见性变化时检查
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[MainNav] 页面变为可见，检查认证状态');
        checkAuth('visibility-change');
      }
    };
    
    // 添加事件监听
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', () => checkAuth('window-focus'));
    
    // 监听存储变化事件
    window.addEventListener('storage', (event) => {
      if (event.key === 'wasAuthenticated' || event.key === 'force_logged_out') {
        console.log(`[MainNav] 存储变化: ${event.key}=${event.newValue}`);
        checkAuth('storage-change');
      }
    });
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', () => checkAuth('window-focus'));
    };
  }, [checkAuth]);
  
  // 直接显示用户积分，无需等待路由变化
  useEffect(() => {
    if (isAuthenticated && credits === null) {
      fetchCredits();
    }
  }, [isAuthenticated, credits, fetchCredits]);

  // 仅在客户端渲染导航栏
  if (!isClient) {
    return null;
  }

  return (
    <div className="flex gap-6 md:gap-10 dark:text-white text-black">
      <Link href="/" className="hidden md:flex items-center space-x-2">
        <Image src={userImage} alt="Company Logo" width={32} height={32} />
        <span className="inline-block font-bold">公司应用</span>
      </Link>
      {navItems.map((item) => (
        <div
          key={item.href}
          className={cn(
            "flex items-center text-lg font-medium transition-colors hover:text-primary sm:text-sm cursor-pointer",
            pathname === item.href
              ? "text-primary"
              : "text-muted-foreground"
          )}
          onClick={(e) => handleNavClick(e, item)}
        >
          {item.icon}
          {item.name}
        </div>
      ))}
      <nav className="flex-1 flex items-center justify-end space-x-4">
        <div className="flex-1 sm:flex-initial flex justify-end">
          {/* 用户积分显示 */}
          {isAuthenticated && credits !== null && (
            <div className="flex items-center mr-3 text-sm text-primary">
              <Sparkles className="h-4 w-4 mr-1" />
              {credits} 点数
            </div>
          )}
          
          {/* 主题切换按钮 */}
          <ModeToggle />
          
          {/* 基于认证状态显示登录/登出按钮 */}
          {isAuthenticated ? (
            <div
              onClick={handleLogout}
              className="flex items-center ml-4 text-sm text-primary cursor-pointer"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4 mr-1" />
              登出
            </div>
          ) : (
            <div
              onClick={() => handleNavigation('/sign-in')}
              className="flex items-center ml-4 text-sm text-primary cursor-pointer"
            >
              <UserIcon className="h-4 w-4 mr-1" />
              登录
            </div>
          )}
        </div>
      </nav>
    </div>
  );
} 