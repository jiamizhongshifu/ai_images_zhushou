"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Edit3, History, HelpCircle, User, LogOut, LogIn, Gem, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { authService, clearAuthState } from "@/utils/auth-service";
import { createClient } from "@/utils/supabase/client";
import { UserCreditDisplay } from "@/components/user-credit-display";
import { creditService, resetCreditsState } from '@/utils/credit-service';
import { buildRelativeUrl } from '@/utils/url';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { limitRequest, REQUEST_KEYS, isRequestInCooldown } from '@/utils/request-limiter';

// 定义CREDIT_EVENTS常量，与credit-service.ts中保持一致
const CREDIT_EVENTS = {
  CREDITS_CHANGED: 'credits_changed',
  CREDITS_REFRESH_NEEDED: 'credits_refresh_needed',
  PAGE_NAVIGATED: 'page_navigated'
};

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
  const [isClient, setIsClient] = useState(false);
  const [isInitialAuthLoading, setIsInitialAuthLoading] = useState(true);
  const supabase = createClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [authStateLocked, setAuthStateLocked] = useState(false);
  const initialAuthStateCheckedRef = useRef<boolean>(false);

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

  // 优化authChange处理函数，只处理认证状态，移除积分逻辑
  useEffect(() => {
    const handleAuthChange = (state: { isAuthenticated: boolean }) => {
      console.log('[MainNav] 认证状态变化处理函数执行, 认证状态:', state.isAuthenticated);
      
      // 立即更新组件的认证状态
      setIsAuthenticated(state.isAuthenticated);
    };
    
    // 订阅认证状态变化
    const unsubscribe = authService.subscribe(handleAuthChange);
    
    // 初始检查当前认证状态
    const checkCurrentAuth = async () => {
      try {
        const { forceSyncAuthState } = await import('@/utils/auth-service');
        // 强制同步认证状态
        forceSyncAuthState();
        
        // 更新组件状态
        const isAuth = authService.isAuthenticated();
        console.log('[MainNav] 初始检查认证状态:', isAuth ? '已登录' : '未登录');
        setIsAuthenticated(isAuth);
        setIsInitialAuthLoading(false);
      } catch (e) {
        console.warn('[MainNav] 初始认证检查失败:', e);
        setIsInitialAuthLoading(false);
      }
    };
    
    // 执行初始检查
    checkCurrentAuth();
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  // 登录后立即检查认证状态和获取点数
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsClient(true);
      
      // 1. 检查URL中的auth_session参数（登录成功标志）
      const url = new URL(window.location.href);
      if (url.searchParams.has('auth_session')) {
        console.log('[MainNav] 检测到auth_session参数，立即更新认证状态');
        
        // 立即设置认证状态
        setIsAuthenticated(true);
        setAuthStateLocked(true);
        initialAuthStateCheckedRef.current = true;
        
        // 清除本地登出标记
        try {
          localStorage.removeItem('force_logged_out');
          sessionStorage.removeItem('isLoggedOut');
        } catch (e) {
          console.warn('[MainNav] 清除登出标记失败', e);
        }
        
        // 设置持久化的认证状态
        try {
          localStorage.setItem('auth_state_persistent', JSON.stringify({ 
            isAuthenticated: true, 
            timestamp: Date.now() 
          }));
          
          // 同时设置临时会话标记
          sessionStorage.setItem('temp_auth_state', 'true');
        } catch (e) {
          console.warn('[MainNav] 设置持久化认证状态失败', e);
        }
        
        // 清除URL参数，避免刷新后重复处理
        url.searchParams.delete('auth_session');
        window.history.replaceState({}, '', url.toString());
      }
      
      // 2. 检查localStorage中的认证状态
      try {
        const persistedState = localStorage.getItem('auth_state_persistent');
        if (persistedState && !isAuthenticated && !authStateLocked) {
          try {
            const parsed = JSON.parse(persistedState);
            if (parsed && parsed.isAuthenticated) {
              console.log('[MainNav] 从持久化存储恢复认证状态');
              setIsAuthenticated(true);
            }
          } catch (e) {
            console.warn('[MainNav] 解析持久化认证状态失败', e);
          }
        }
      } catch (e) {
        console.warn('[MainNav] 检查持久化认证状态失败', e);
      }
      
      // 3. 检查sessionStorage中的临时认证标记
      try {
        const tempAuth = sessionStorage.getItem('temp_auth_state');
        if (tempAuth === 'true' && !isAuthenticated && !authStateLocked) {
          console.log('[MainNav] 从临时会话存储恢复认证状态');
          setIsAuthenticated(true);
        }
      } catch (e) {
        console.warn('[MainNav] 检查临时认证标记失败', e);
      }
    }
  }, [pathname, isAuthenticated, authStateLocked]);

  // 添加处理登录点击的函数
  const handleLoginClick = useCallback(() => {
    console.log('[MainNav] 用户点击登录按钮');
    
    // 清除登出标记
    try {
      localStorage.removeItem('force_logged_out');
      sessionStorage.removeItem('isLoggedOut');
    } catch (e) {
      console.warn('[MainNav] 清除登出标记失败', e);
    }
    
    // 构建登录URL
    const loginUrl = '/sign-in';
    // 使用router.push进行导航
    router.push(loginUrl);
  }, [router]);

  // 添加处理登出的函数
  const handleLogout = useCallback(async () => {
    try {
      setIsSigningOut(true);
      
      console.log('[MainNav] 开始登出操作');
      
      // 1. 先设置临时登出标记，立即影响UI
      localStorage.setItem('force_logged_out', 'true');
      sessionStorage.setItem('isLoggedOut', 'true');
      
      // 2. 调用API登出端点，确保服务器端也清除会话
      try {
        const response = await fetch('/api/auth/signout', {
          method: 'POST',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        
        if (!response.ok) {
          console.warn('[MainNav] 登出API调用失败，状态码:', response.status);
        } else {
          console.log('[MainNav] 服务端登出成功');
        }
      } catch (apiError) {
        console.error('[MainNav] 调用登出API出错:', apiError);
      }
      
      // 3. 清除认证服务状态
      authService.clearAuthState();
      
      // 立即更新状态
      setIsAuthenticated(false);
      
      // 4. 使用window.location进行硬重定向，确保完全刷新页面
      window.location.href = '/?logged_out=true';
    } catch (error) {
      console.error('[MainNav] 登出过程中出错:', error);
      window.location.href = '/?error=logout_failed';
    } finally {
      setIsSigningOut(false);
    }
  }, []);

  // 添加处理导航项点击的函数
  const handleNavClick = useCallback((e: React.MouseEvent, item: NavItem) => {
    // 如果需要认证但用户未认证，阻止导航
    if (item.requiresAuth && !isAuthenticated) {
      e.preventDefault();
      console.log('[MainNav] 阻止未认证用户访问:', item.href);
      // 可以选择提示用户登录
      const confirm = window.confirm('请先登录以访问此页面，是否前往登录页面？');
      if (confirm) {
        handleLoginClick();
      }
      return;
    }
    
    // 否则，正常导航
    console.log('[MainNav] 导航到:', item.href);
  }, [isAuthenticated, handleLoginClick]);

  return (
    <div className="flex items-center justify-between w-full">
      {/* 导航菜单居中布局 */}
      <div className="flex-1 flex items-center justify-center">
        <nav className="flex items-center space-x-6 text-sm font-medium">
          {navItems.map((item) => {
            // 如果需要认证但未认证，禁用链接
            const isDisabled = item.requiresAuth && !isAuthenticated;
            
            return (
              <div key={item.href} className="relative">
                {isDisabled ? (
                  // 禁用状态显示为灰色
                  <span
                    className={cn(
                      "flex items-center text-muted-foreground cursor-not-allowed opacity-70",
                      pathname === item.href && "text-foreground font-semibold"
                    )}
                    title="请先登录"
                  >
                    {item.icon}
                    {item.name}
                  </span>
                ) : (
                  // 正常链接
                  <Link
                    href={item.href}
            className={cn(
                      "flex items-center text-muted-foreground hover:text-foreground transition-colors",
                      pathname === item.href && "text-foreground font-semibold"
                    )}
                    onClick={(e) => handleNavClick(e, item)}
          >
            {item.icon}
                    {item.name}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      </div>
      
      {/* 用户信息区域放在最右侧 */}
      <div className="flex items-center space-x-1">
        {isAuthenticated ? (
          <>
            {/* 已登录状态，显示点数和用户操作 */}
            <UserCreditDisplay className="mr-2" />
            <Button 
              variant="outline"
              size="sm"
              onClick={handleLogout}
              disabled={isSigningOut}
              className="ml-2"
            >
              {isSigningOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 mr-1" />
              )}
              退出
            </Button>
          </>
        ) : (
          /* 未登录状态，显示登录按钮 */
          <Button 
            variant="default" 
            size="sm" 
            onClick={handleLoginClick}
            className="ml-2"
          >
            <LogIn className="h-4 w-4 mr-1" />
            登录
          </Button>
        )}
      </div>
    </div>
  );
} 