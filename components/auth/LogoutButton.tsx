import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/utils/auth-service';
import enhanceAuthResilience, { isOfflineModeEnabled } from '@/utils/auth-resilience';
import { Button } from '@/components/ui/button';

interface LogoutButtonProps {
  className?: string;
  variant?: 'default' | 'link' | 'outline' | 'destructive' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  children?: React.ReactNode;
  redirectPath?: string;
}

export default function LogoutButton({
  className = '',
  variant = 'outline',
  size = 'default',
  children,
  redirectPath = '/login'
}: LogoutButtonProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      
      // 检查是否在离线模式
      if (isOfflineModeEnabled()) {
        console.log('[登出] 检测到离线模式，直接删除Cookie');
        // 删除离线模式Cookie
        document.cookie = 'force_login=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'auth_connection_issue=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        
        // 重定向到登录页
        router.push(redirectPath);
        return;
      }
      
      // 正常登出流程
      const success = await signOut();
      
      if (success) {
        console.log('[登出] 成功登出');
        
        // 添加登出标记到会话存储
        try {
          sessionStorage.setItem('isLoggedOut', 'true');
        } catch (storageError) {
          console.warn('[登出] 无法写入会话存储，可能是隐私模式:', storageError);
          // 触发存储访问失败处理 - 改用内联实现，避免导入问题
          try {
            console.warn('[认证弹性] 处理存储访问失败，可能在隐私模式下');
            // 设置Cookie标记
            if (typeof document !== 'undefined') {
              document.cookie = 'storage_access_failed=true;path=/;max-age=' + (60 * 30); // 30分钟有效期
            }
          } catch (err) {
            console.error('[认证弹性] 处理存储访问失败时出错:', err);
          }
        }
        
        // 设置强制登出标记为Cookie
        document.cookie = 'force_logged_out=true; path=/; max-age=' + (60 * 5); // 5分钟有效期
        
        // 重定向到登录页
        router.push(redirectPath);
      } else {
        console.error('[登出] 登出失败');
        // 失败时也尝试强制登出
        document.cookie = 'force_logged_out=true; path=/; max-age=' + (60 * 5);
        router.push(redirectPath);
      }
    } catch (error) {
      console.error('[登出] 登出过程中出错:', error);
      // 出错时也尝试强制登出
      document.cookie = 'force_logged_out=true; path=/; max-age=' + (60 * 5);
      router.push(redirectPath);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleLogout}
      disabled={isLoggingOut}
    >
      {isLoggingOut ? '登出中...' : children || '退出登录'}
    </Button>
  );
} 