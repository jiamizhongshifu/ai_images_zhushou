"use client";

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { resetCreditsState } from '@/utils/credit-service';
import { createClient } from '@/utils/supabase/client';

/**
 * 登出处理器组件
 * 检测URL中的登出参数，并确保所有状态被正确清理
 */
export function LogoutHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // 检查是否有searchParams以及URL是否包含登出参数
    const hasLogoutParam = searchParams?.has('logout') || false;
    const hasForceLogoutParam = searchParams?.has('force_logout') || false;
    
    // 如果检测到登出参数，执行彻底清理
    if (hasLogoutParam || hasForceLogoutParam) {
      console.log('[LogoutHandler] 检测到登出参数，执行额外清理操作');
      
      // 执行清理操作
      const performCleanup = async () => {
        try {
          // 1. 强制设置登出标记
          localStorage.setItem('force_logged_out', 'true');
          sessionStorage.setItem('isLoggedOut', 'true');
          
          // 2. 重置点数服务状态
          resetCreditsState();
          
          // 3. 再次调用Supabase登出（以防万一前一次未完成）
          try {
            await supabase.auth.signOut();
          } catch (err) {
            console.error('[LogoutHandler] Supabase登出出错', err);
          }
          
          // 4. 清理所有关键cookie
          const cookieNames = [
            'sb-access-token', 'sb-refresh-token', '__session', 
            'sb-refresh-token-nonce', 'user_authenticated', 
            'sb-session-recovery', 'manualAuth', 'sb-auth-token'
          ];
          
          cookieNames.forEach(name => {
            document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
          });
          
          // 5. 移除URL中的登出参数（防止刷新页面时重复执行）
          if (window.history.pushState) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('logout');
            newUrl.searchParams.delete('force_logout');
            newUrl.searchParams.delete('t');
            
            // 使用history API更新URL，不触发页面刷新
            window.history.pushState({path: newUrl.toString()}, '', newUrl.toString());
            
            console.log('[LogoutHandler] 已移除URL中的登出参数');
          }
          
          console.log('[LogoutHandler] 登出清理完成');
        } catch (error) {
          console.error('[LogoutHandler] 登出清理过程出错:', error);
        }
      };
      
      performCleanup();
    }
  }, [searchParams, router, supabase]);

  // 这是一个纯功能组件，不渲染任何UI
  return null;
}

export default LogoutHandler; 