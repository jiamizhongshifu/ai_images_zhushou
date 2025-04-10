import React from 'react';
import { Button } from '@/components/ui/button';
import { useUserStore, useUserAuth } from '@/store';
import { handleLogout } from '@/app/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resetUser = useUserStore((state: any) => state.resetUser);
  const { setAuth } = useUserAuth();

  // 清理本地存储中所有认证相关数据的函数
  const clearLocalAuthData = () => {
    console.log('清理本地认证数据');
    
    // 清理localStorage中所有可能的认证相关数据
    const authKeys = [
      'sb-access-token',
      'sb-refresh-token',
      'supabase.auth.token',
      'supabase-auth-token',
      'activeAuth',
      'wasAuthenticated',
      'user-data',
      'user-credits',
      'auth-state',
      'last-auth-check',
      'user-session',
      'auth-persist',
      'session_verified',
      'sb-session-recovery',
      'temp_auth_state',
      'auth_state_persistent',
      'auth_valid',
      'auth_time'
    ];
    
    authKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch (e) {
        console.error(`清理存储键 ${key} 时出错:`, e);
      }
    });
    
    // 尝试移除所有以supabase开头的键
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('supabase') || key.startsWith('sb-') || key.includes('auth')) {
          localStorage.removeItem(key);
        }
      });
      
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('supabase') || key.startsWith('sb-') || key.includes('auth')) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error('清理所有supabase相关存储时出错:', e);
    }
  };

  const onLogout = async () => {
    try {
      // 调用后端登出API
      const response = await handleLogout();
      
      // 检查响应中是否有清理存储的指令
      if (response && response.clearStorage) {
        clearLocalAuthData();
      }
      
      // 检查响应头中是否有清理存储的指令
      if (response && response.headers) {
        const headers = response.headers;
        if (headers.get('X-Clear-Auth-Storage') === 'true') {
          clearLocalAuthData();
        }
      }
      
      // 重置全局状态
      resetUser();
      setAuth(false);
      
      // 显示成功提示
      toast.success('已成功登出');
      
      // 强制刷新页面以确保所有状态都被重置
      setTimeout(() => {
        window.location.href = '/';  // 使用硬重定向而非router.push以确保完全刷新
      }, 500);
    } catch (error) {
      console.error('登出过程中出错:', error);
      toast.error('登出时出现问题');
      
      // 即使发生错误也清理本地存储
      clearLocalAuthData();
      resetUser();
      setAuth(false);
      
      // 强制刷新
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    }
  };

  return (
    <Button variant="ghost" onClick={onLogout} className="flex items-center gap-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
        />
      </svg>
      登出
    </Button>
  );
} 