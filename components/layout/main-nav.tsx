"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Edit3, History, HelpCircle, User, LogOut, LogIn, Gem } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { authService, clearAuthState } from "@/utils/auth-service";
import { createClient } from "@/utils/supabase/client";
import UserCreditDisplay from "@/components/user-credit-display";
import { creditService, resetCreditsState } from '@/utils/credit-service';
import { buildRelativeUrl } from '@/utils/url';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { siteConfig } from '@/config/site';
import { NavItem } from '@/types/nav';
import AuthButton from "@/components/auth-button";

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
        
        // 增强错误处理：401未授权错误时，需要更新认证状态
        if (creditsResponse.status === 401) {
          console.warn('[MainNav] fetchCredits: 收到401未授权响应，更新认证状态为未登录');
          setIsAuthenticated(false);
          setAuthStateLocked(false);
          setCredits(null);
          
          // 清除所有认证相关的状态标记
          // 1. 清除cookie
          const cookiesToClear = [
            'user_authenticated', 
            'sb-access-token', 
            'sb-refresh-token', 
            '__session',
            'force_login'
          ];
          
          cookiesToClear.forEach(name => {
            document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
          });
          
          // 2. 设置登出标记
          localStorage.setItem('force_logged_out', 'true');
          sessionStorage.setItem('isLoggedOut', 'true');
          
          // 3. 清除其他认证标记
          localStorage.removeItem('wasAuthenticated');
          localStorage.removeItem('auth_time');
          localStorage.removeItem('auth_state');
          localStorage.removeItem('auth_valid');
          sessionStorage.removeItem('activeAuth');
          
          // 4. 调用认证服务清除状态
          try {
            if (authService) {
              console.log('[MainNav] fetchCredits: 调用认证服务清除状态');
              authService.clearAuthState();
            }
          } catch (authError) {
            console.error('[MainNav] fetchCredits: 调用认证服务清除状态失败:', authError);
          }
          
          // 5. 尝试调用登出API完成服务端登出
          try {
            console.log('[MainNav] fetchCredits: 尝试调用登出API');
            fetch('/api/auth/signout', {
              method: 'POST',
              headers: { 'Cache-Control': 'no-cache' }
            }).catch(apiError => {
              console.error('[MainNav] fetchCredits: 调用登出API失败:', apiError);
            });
          } catch (apiError) {
            console.error('[MainNav] fetchCredits: 准备调用登出API时出错:', apiError);
          }
          
          console.warn('[MainNav] fetchCredits: 检测到认证状态不同步，已同步清除所有认证状态');
        } else {
          // 非401错误，只设置积分为0但不修改认证状态
          setCredits(0);
        }
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
        
        // 确保清理所有可能的认证标记
        if (isInitialCheck) {
          console.log('[MainNav] checkAuthState: 初始检查时会话获取失败，清理所有认证标记');
          document.cookie = 'user_authenticated=; path=/; max-age=0';
          localStorage.removeItem('wasAuthenticated');
          sessionStorage.removeItem('activeAuth');
        }
        
        return false; // Indicate logged out
      }

      const session = data?.session;
      const currentIsAuthenticated = !!session;
      console.log(`[MainNav] checkAuthState: 会话检查结果: ${currentIsAuthenticated ? '有效' : '无效'}`);

      // 如果是初始检查，确保状态更加可靠
      if (isInitialCheck) {
        // 如果会话无效但本地标志显示已登录，这是不一致的情况
        const hasAuthCookie = document.cookie.includes('user_authenticated=true');
        const wasAuthenticated = localStorage.getItem('wasAuthenticated') === 'true';
        const activeAuth = sessionStorage.getItem('activeAuth') === 'true';
        
        if (!currentIsAuthenticated && (hasAuthCookie || wasAuthenticated || activeAuth)) {
          console.warn('[MainNav] checkAuthState: 检测到认证状态不一致，服务端未认证但本地标记显示已登录');
          // 清除所有错误的认证标记
          document.cookie = 'user_authenticated=; path=/; max-age=0';
          localStorage.removeItem('wasAuthenticated');
          sessionStorage.removeItem('activeAuth');
        }
      }

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
      
      // 清理认证标记
      if (isInitialCheck) {
        document.cookie = 'user_authenticated=; path=/; max-age=0';
        localStorage.removeItem('wasAuthenticated');
        sessionStorage.removeItem('activeAuth');
      }
      
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

    console.log("[MainNav] useEffect: V3 - 开始执行初始加载和监听器设置");
    setIsInitialAuthLoading(true); // Start loading

    // **1. Check for Logout Flags (Highest Priority)**
    let loggedOutByFlag = false;
    try {
      if (typeof window !== 'undefined') {
        const forceLoggedOut = localStorage.getItem('force_logged_out') === 'true';
        const isLoggedOut = sessionStorage.getItem('isLoggedOut') === 'true';
        if (forceLoggedOut || isLoggedOut) {
          console.log('[MainNav] useEffect: V3 - 检测到登出标记，强制设置为未登录状态');
          loggedOutByFlag = true;
          // Set state immediately
          setIsAuthenticated(false);
          setAuthStateLocked(false); // Ensure unlocked
          setCredits(null);
          // Clear flags
          localStorage.removeItem('force_logged_out');
          sessionStorage.removeItem('isLoggedOut');
          // Clear potential cookies (redundant but safe)
          document.cookie = 'user_authenticated=; path=/; max-age=0';
          localStorage.removeItem('wasAuthenticated');
          // End loading immediately
          setIsInitialAuthLoading(false);
        }
      }
    } catch (error) {
      console.error('[MainNav] useEffect: V3 - 检查登出标记时出错:', error);
    }

    // **2. 先检查API认证状态作为初始化验证 (新增) **
    const checkAPIAuthState = async () => {
      if (!isMounted) return;
      try {
        console.log("[MainNav] useEffect: 执行API认证状态检查");
        // 发送一个简单的认证探测请求
        const authProbeResponse = await fetch('/api/auth/status', { 
          method: 'GET',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!isMounted) return;
        
        if (authProbeResponse.ok) {
          const authData = await authProbeResponse.json();
          console.log("[MainNav] API认证状态检查结果:", authData);
          
          // 如果API返回未认证，则强制更新状态
          if (!authData.authenticated) {
            console.warn("[MainNav] API认证检查显示用户未登录，但前端可能状态不同步");
            setIsAuthenticated(false);
            setAuthStateLocked(false);
            setCredits(null);
            // 清除可能的错误cookie
            document.cookie = 'user_authenticated=; path=/; max-age=0';
            localStorage.removeItem('wasAuthenticated');
            sessionStorage.removeItem('activeAuth');
          } 
          // 如果API返回已认证，但前端显示未认证，也同步更新
          else if (authData.authenticated && !isAuthenticated && !authStateLocked) {
            console.log("[MainNav] API认证检查显示用户已登录，更新前端状态");
            setIsAuthenticated(true);
            // 不锁定状态，等待后续Supabase会话检查结果
          }
        } else {
          // API调用失败时，继续使用Supabase会话检查作为备选
          console.warn("[MainNav] API认证状态检查失败:", authProbeResponse.status);
        }
      } catch (error) {
        console.error("[MainNav] API认证状态检查异常:", error);
      }
    };
    
    // 只有在未被登出标记处理时，才进行API认证检查
    if (!loggedOutByFlag && isMounted) {
      checkAPIAuthState().then(() => {
        // 无论API认证检查结果如何，都进行Supabase会话检查以获取最终确认
        if (isMounted) {
          console.log("[MainNav] useEffect: V3 - 未检测到登出标记，执行初始会话检查 (checkAuthState)");
          checkAuthState(true); // Pass true for initial check
        }
      });
    } else if (loggedOutByFlag) {
      console.log("[MainNav] useEffect: V3 - 已被登出标记处理，跳过初始会话检查。");
    }

    // **3. Setup Supabase Auth Listener for subsequent changes**
    console.log("[MainNav] useEffect: V3 - 设置Supabase onAuthStateChange监听器");
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) {
           console.log("[MainNav] onAuthStateChange: V3 - 组件已卸载，忽略事件:", event);
           return;
        }
        console.log(`[MainNav] onAuthStateChange: V3 - 事件: ${event}, 会话: ${session ? '存在' : '不存在'}`);

        // CRITICAL: Always re-run checkAuthState to ensure consistent state handling
        // regardless of the event type or current local state.
        // checkAuthState is now the single source of truth updater based on Supabase.
        console.log("[MainNav] onAuthStateChange: V3 - 触发 checkAuthState 进行权威状态更新");
        checkAuthState(false); // Pass false for subsequent checks

        // Ensure loading indicator is off if an event happens while it's somehow still on
        if (isInitialAuthLoading) {
           console.warn("[MainNav] onAuthStateChange: V3 - 初始加载状态仍为true，强制结束");
           setIsInitialAuthLoading(false);
        }
      }
    );

    // **4. Remove Visibility Change Listener**
    // The onAuthStateChange listener and checking session on load should be sufficient.
    // Re-checking on visibility often caused conflicts.
    // If needed later, it should call checkAuthState.
    /*
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMounted) {
        console.log('[MainNav] 页面变为可见，重新检查认证状态 (调用 checkAuthState)');
        checkAuthState(false); // Call the authoritative function
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    */

    // Cleanup function
    return () => {
      console.log("[MainNav] useEffect: V3 - 清理函数执行，组件卸载");
      isMounted = false;
      //document.removeEventListener('visibilitychange', handleVisibilityChange); // Remove if listener was added
      if (subscription) {
        console.log("[MainNav] useEffect: V3 - 取消Supabase onAuthStateChange订阅");
        subscription.unsubscribe();
      } else {
        console.warn("[MainNav] useEffect: V3 - 无法取消订阅，subscription对象未定义？");
      }
    };
    // Dependencies: Only supabase client and the checkAuthState function itself
  }, [supabase, checkAuthState]);

  // 处理导航项点击
  const handleNavClick = async (e: React.MouseEvent, item: NavItem) => {
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
      // 使用buildRelativeUrl构建相对URL，确保使用当前环境
      const loginUrl = buildRelativeUrl('/sign-in', { redirect: returnUrl });
      
      // 使用相对路径导航
      router.push(loginUrl);
      return;
    }
    
    // 检查是否是当前页面
    if (pathname === item.href) {
      console.log(`[MainNav] 已在当前页面: ${item.name}`);
      return;
    }
    
    // 正常导航操作
    console.log(`[MainNav] 导航到: ${item.name} (${item.href})`);
    
    // 特殊处理受保护的页面，进行严格会话验证
    if (item.requiresAuth) {
      console.log(`[MainNav] 特殊处理受保护页面，验证会话状态: ${item.name}`);
      
      // 检查是否有登出标记 - 如果有，不应添加force_login参数
      const hasLogoutFlag = localStorage.getItem('force_logged_out') === 'true' || 
                            sessionStorage.getItem('isLoggedOut') === 'true' ||
                            document.cookie.includes('force_logged_out=true');
                            
      if (hasLogoutFlag) {
        console.log(`[MainNav] 检测到登出标记，进行无参数导航: ${item.name}`);
        router.push(item.href);
        return;
      }
      
      // 进行严格的会话验证
      let hasValidSession = false;
      try {
        console.log(`[MainNav] 开始严格会话验证`);
        // 检查Supabase会话
        const { data } = await supabase.auth.getSession();
        hasValidSession = !!data.session?.user;
        console.log(`[MainNav] 会话验证结果: ${hasValidSession ? '有效' : '无效'}`);
      } catch (error) {
        console.error(`[MainNav] 会话验证出错:`, error);
        hasValidSession = false;
      }
      
      if (!hasValidSession) {
        console.log(`[MainNav] 未验证到有效会话，进行无参数导航: ${item.name}`);
        router.push(item.href);
        return;
      }
      
      // 只有确认有有效会话时，才设置认证标记
      console.log(`[MainNav] 验证到有效会话，设置认证标记并导航: ${item.name}`);
      document.cookie = 'user_authenticated=true; path=/; max-age=86400';
      localStorage.setItem('wasAuthenticated', 'true');
      // 设置多个不同的标记，以增加可靠性
      sessionStorage.setItem('activeAuth', 'true');
      
      // 使用路由器进行导航，避免添加force_login参数，改为添加会话确认参数
      const currentUrl = new URL(item.href, window.location.origin);
      // 添加session_verified参数代替force_login，表示已通过会话验证
      currentUrl.searchParams.append('session_verified', 'true');
      currentUrl.searchParams.append('verify_time', Date.now().toString());
      
      // 使用路由器进行导航，确保使用当前环境的URL
      router.push(currentUrl.pathname + currentUrl.search);
    } else {
      // 对非受保护页面，使用标准路由导航
      router.push(item.href);
    }
  };

  // 处理登录按钮点击
  const handleLoginClick = () => {
    console.log("[MainNav] handleLoginClick: 跳转到登录页");
    
    // 获取当前路径作为重定向目标
    const currentPath = pathname ?? '/';
    
    // 使用buildRelativeUrl构建相对URL，确保使用当前环境
    const loginUrl = buildRelativeUrl('/sign-in', { 
      redirect: encodeURIComponent(currentPath)
    });
    
    console.log("[MainNav] 跳转到登录页:", loginUrl);
    
    // 使用router.push进行导航
    router.push(loginUrl);
  };

  // 处理登出按钮点击
  const handleLogout = async () => {
    console.log("[MainNav] handleLogout: 开始执行登出...");
    try {
      setIsSigningOut(true);
      
      // **立即添加特殊标记，确保后续检查可以识别登出状态**
      document.body.setAttribute('data-logout-in-progress', 'true');
      
      // **1. 立即更新UI状态以提供即时反馈**
      setIsAuthenticated(false);
      setAuthStateLocked(false);
      setCredits(null);
      console.log("[MainNav] handleLogout: 已立即更新UI状态为未登录");
      
      // **1.1 立即重置点数服务状态** 
      resetCreditsState();
      console.log("[MainNav] handleLogout: 已重置点数服务状态");
      
      // **2. 坚决设置登出标记 (最高优先级)** 
      localStorage.setItem('force_logged_out', 'true');
      localStorage.setItem('logout_time', Date.now().toString());
      sessionStorage.setItem('isLoggedOut', 'true');
      
      // **2.1 设置HTTP Cookie标记登出状态，确保服务端能识别**
      document.cookie = 'force_logged_out=true; path=/; max-age=300'; // 5分钟有效期
      document.cookie = 'user_authenticated=; path=/; max-age=0'; // 立即删除认证cookie
      console.log("[MainNav] handleLogout: 已设置登出标记 (localStorage、sessionStorage和Cookie)");

      // 3. 调用Supabase API进行登出
      console.log("[MainNav] handleLogout: 调用Supabase API signOut...");
      try {
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.error('[MainNav] handleLogout: Supabase API登出错误:', error);
        }
      } catch (err) {
        console.error('[MainNav] handleLogout: Supabase signOut异常:', err);
        // 继续执行后续清理，不中断流程
      }
      
      // 4. 彻底清理所有认证相关的状态和Cookie
      console.log("[MainNav] handleLogout: 清理authService状态和Cookies...");
      try {
        clearAuthState(); // 清理认证服务状态
      } catch (err) {
        console.error('[MainNav] handleLogout: 清理authService状态出错:', err);
      }
      
      // 清理所有相关cookie
      const cookieNames = [
        'sb-access-token', 'sb-refresh-token', '__session', 
        'sb-refresh-token-nonce', 'user_authenticated', 
        'sb-session-recovery', 'manualAuth', 'sb-auth-token'
      ];
      const commonOptions = '; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      cookieNames.forEach(cookieName => {
        document.cookie = `${cookieName}=${commonOptions}`;
        try { // 添加域名相关的cookie清理
          const domainParts = window.location.hostname.split('.');
          if (domainParts.length > 1) {
            const rootDomain = domainParts.slice(-2).join('.');
            document.cookie = `${cookieName}=${commonOptions}; domain=.${rootDomain}`;
          }
          document.cookie = `${cookieName}=${commonOptions}; domain=${window.location.hostname}`;
        } catch (e) { console.warn("Cookie clear domain error:", e);}
      });
      
      // 清理所有localStorage项
      const keysToRemove = [
        'supabase.auth.token', 'supabase.auth.expires_at', 
        'auth_state', 'auth_valid', 'auth_time', 
        'wasAuthenticated', 'activeAuth',
        'sb:token', 'sb:session', 'sb-provider-token'
      ];
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn(`清理localStorage项 ${key} 出错:`, e);
        }
      });
      
      // 清理sessionStorage
      try {
        sessionStorage.clear();
        // 重新设置登出标记，因为clear()会清除所有内容
        sessionStorage.setItem('isLoggedOut', 'true');
      } catch (e) {
        console.warn("清理sessionStorage出错:", e);
      }
      
      console.log("[MainNav] handleLogout: 清理完成");

      // 5. 强制页面重载而非简单重定向
      console.log("[MainNav] handleLogout: 准备强制重载页面...");
      
      // 5.1 构建包含强制登出参数的URL，使用相对路径而非绝对URL
      const logoutParams = new URLSearchParams();
      logoutParams.set('logout', 'true');
      logoutParams.set('t', Date.now().toString());
      logoutParams.set('force_logout', 'true');
      
      // 使用相对路径，确保在当前环境下重载
      const logoutPath = `/?${logoutParams.toString()}`;
      console.log("[MainNav] handleLogout: 执行页面重载", logoutPath);
      
      // 5.2 使用window.location.href确保完全刷新而不是客户端路由
      window.location.href = logoutPath;
      
    } catch (error) {
      console.error('[MainNav] handleLogout: 登出过程中发生异常:', error);
      // 确保UI反映登出状态，即使发生错误
      setIsAuthenticated(false);
      setAuthStateLocked(false);
      setCredits(null);
      
      // 强制重载页面，确保状态重置，使用相对路径
      window.location.href = '/?logout=true&error=1';
    }
  };

  // 仅在客户端渲染导航栏
  if (!isClient) {
    return null;
  }

  // 强制确认登录状态一致性 (如果已明确登出，确保显示登录按钮)
  const forceLoggedOut = typeof localStorage !== 'undefined' && localStorage.getItem('force_logged_out') === 'true';
  const sessionLogout = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('isLoggedOut') === 'true';
  const showLoginButton = !isAuthenticated || forceLoggedOut || sessionLogout;

  return (
    <nav className="flex items-center w-full justify-between flex-wrap md:flex-nowrap">
      {/* 留出左侧空间，导航项居中 */}
      <div className="hidden md:block w-0 md:w-auto"></div>
      
      {/* 导航项居中显示 */}
      <div className="flex items-center gap-3 justify-center mx-auto flex-wrap">
        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={(e) => {
              if (item.requiresAuth && !isAuthenticated) {
                e.preventDefault();
                console.log(`[MainNav] 导航到 ${item.href} 需要认证，跳转到登录页`);
                handleLoginClick(); // Redirect to login if auth required and not authenticated
              } else {
                handleNavClick(e, item); // Proceed with navigation if auth not required or user is authenticated
              }
            }}
            className={cn(
              buttonVariants({
                variant: pathname === item.href ? "secondary" : "ghost",
                size: "sm",
              }),
              "flex items-center gap-1 my-1",
              // Visually indicate disabled state if auth is required but user not logged in
              item.requiresAuth && !isAuthenticated ? "opacity-50 cursor-not-allowed" : ""
            )}
            // Disable button if auth is required but user not logged in
            disabled={item.requiresAuth && !isAuthenticated && !isInitialAuthLoading}
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
        ) : showLoginButton ? (
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
        ) : (
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
        )}
      </div>
    </nav>
  );
} 