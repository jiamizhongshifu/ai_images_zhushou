/**
 * 会话恢复组件
 * 处理会话意外失效的恢复逻辑
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { authService } from '@/utils/auth-service';
import { clearAuthRecoveryState } from '@/utils/session-validator';

export function SessionRecovery() {
  const router = useRouter();
  const [isRecovering, setIsRecovering] = useState(false);
  
  useEffect(() => {
    // 检查是否需要恢复
    const needsRecovery = localStorage.getItem('auth_needs_recovery') === 'true';
    const savedPath = localStorage.getItem('auth_recovery_path');
    
    if (needsRecovery && savedPath) {
      handleRecovery(savedPath);
    }
  }, [router]);
  
  const handleRecovery = async (savedPath: string) => {
    if (isRecovering) return;
    
    try {
      setIsRecovering(true);
      console.log('[SessionRecovery] 开始恢复会话');
      
      // 尝试刷新会话
      await authService.forceRefreshSession();
      
      // 获取最新会话状态
      const session = await authService.getSession();
      
      if (session) {
        console.log('[SessionRecovery] 会话恢复成功，准备跳转:', savedPath);
        
        // 清除恢复状态
        clearAuthRecoveryState();
        
        // 延迟跳转，确保认证状态已完全更新
        setTimeout(() => {
          toast.success('已恢复您之前的会话');
          router.push(savedPath);
        }, 1000);
      } else {
        console.warn('[SessionRecovery] 会话恢复失败');
        clearAuthRecoveryState();
        toast.error('会话恢复失败，请重新登录');
      }
    } catch (error) {
      console.error('[SessionRecovery] 恢复过程出错:', error);
      clearAuthRecoveryState();
      toast.error('会话恢复出错，请重新登录');
    } finally {
      setIsRecovering(false);
    }
  };
  
  // 无UI渲染
  return null;
} 