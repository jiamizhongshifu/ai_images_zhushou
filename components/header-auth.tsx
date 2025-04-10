import { Button } from "./ui/button";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { signOut as authSignOut, isAuthenticated, getAuthState } from "@/utils/auth-service";

export default function HeaderAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabase = createClient();
  // 添加防抖控制引用
  const isCheckingRef = useRef(false);
  // 确保会话验证只执行一次
  const hasValidatedRef = useRef(false);

  const checkAuthStatus = async () => {
    // 防抖控制，避免并发检查
    if (isCheckingRef.current) return;
    
    try {
      isCheckingRef.current = true;
      
      // 首先检查是否有强制登出标记
      if (typeof window !== 'undefined') {
        const hasLogoutCookie = localStorage.getItem('force_logged_out') === 'true';
        const isLoggedOut = sessionStorage.getItem('isLoggedOut') === 'true';
        const loggedOutCookie = document.cookie.includes('force_logged_out=true');
        
        // 如果有任何登出标记，优先处理为未登录
        if (hasLogoutCookie || isLoggedOut || loggedOutCookie) {
          console.log('[HeaderAuth] 检测到登出标记，强制设置为未登录状态');
          setIsAuthenticated(false);
          setUserEmail(null);
          setIsLoading(false);
          // 标记已完成验证
          hasValidatedRef.current = true;
          return;
        }
      }
      
      // 使用auth-service而非直接检查Supabase会话
      const authState = getAuthState();
      
      // 检查系统认证状态
      if (authState.isAuthenticated === false) {
        console.log('[HeaderAuth] 认证服务显示用户未登录');
        setIsAuthenticated(false);
        setUserEmail(null);
        setIsLoading(false);
        hasValidatedRef.current = true;
        return;
      }
      
      // 如果需要，进行实际会话验证
      if (!hasValidatedRef.current) {
        // 使用getUser而非getSession（更安全的会话验证方式）
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error || !user) {
          console.log('[HeaderAuth] 用户验证失败或无有效用户:', error?.message);
          // 登出状态下清除所有残留状态
          setLocalLogoutState();
          setIsAuthenticated(false);
          setUserEmail(null);
        } else {
          console.log('[HeaderAuth] 用户验证成功:', user.email);
          setIsAuthenticated(true);
          setUserEmail(user.email || null);
        }
        
        // 标记验证已完成
        hasValidatedRef.current = true;
      }
    } catch (error) {
      console.error('[HeaderAuth] 验证状态检查失败:', error);
      // 错误时默认为未登录状态
      setIsAuthenticated(false);
      setUserEmail(null);
    } finally {
      setIsLoading(false);
      isCheckingRef.current = false;
    }
  };
  
  // 设置本地登出状态的辅助函数
  const setLocalLogoutState = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('force_logged_out', 'true');
      sessionStorage.setItem('isLoggedOut', 'true');
      
      // 设置cookie方式的登出标记
      document.cookie = `force_logged_out=true; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
    }
  };

  useEffect(() => {
    // 初次加载立即检查
    checkAuthStatus();
    
    // 监听存储变化事件来检测登录状态变化
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'force_logged_out' || event.key === 'isLoggedOut') {
        checkAuthStatus();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // 添加全局自定义事件监听
    const handleAuthChange = () => {
      console.log('[HeaderAuth] 检测到认证状态变化事件');
      // 重置验证状态，确保重新进行完整验证
      hasValidatedRef.current = false;
      checkAuthStatus();
    };
    
    window.addEventListener('auth-state-changed', handleAuthChange);
    
    // 检查URL参数
    const checkURLParams = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('logged_out') || urlParams.has('logout') || urlParams.has('force_logout')) {
          console.log('[HeaderAuth] 检测到URL中的登出参数');
          setLocalLogoutState();
          setIsAuthenticated(false);
          hasValidatedRef.current = true;
        }
      } catch (error) {
        console.error('[HeaderAuth] 检查URL参数出错:', error);
      }
    };
    
    checkURLParams();
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-state-changed', handleAuthChange);
    };
  }, [supabase]);

  const signOut = async () => {
    setIsLoading(true);
    try {
      // 使用统一的认证服务登出方法
      await authSignOut();
      
      // 强制设置前端状态
      setIsAuthenticated(false);
      setUserEmail(null);
      
      // 设置本地登出状态
      setLocalLogoutState();
      
      // 触发全局认证状态变化事件
      window.dispatchEvent(new Event('auth-state-changed'));
      
      // 携带登出参数重定向到首页
      router.push("/?logged_out=true");
    } catch (error) {
      console.error('[HeaderAuth] 登出失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Button variant="outline">加载中...</Button>;
  }

  return isAuthenticated ? (
    <div className="flex items-center gap-4">
      Hey, {userEmail}!
      <Button variant="outline" onClick={signOut}>
        登出
      </Button>
    </div>
  ) : (
    <Button
      onClick={() => router.push("/sign-in")}
    >
      登录
    </Button>
  );
}
