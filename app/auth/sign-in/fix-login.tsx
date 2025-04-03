"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

/**
 * 用于解决登录后状态同步问题的组件
 * 当检测到用户已登录但路由错误时自动恢复
 */
export default function FixLogin() {
  const router = useRouter();
  const supabase = createClient();
  
  useEffect(() => {
    const checkAndFixLogin = async () => {
      try {
        console.log('[登录修复] 检查登录状态...');
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[登录修复] 获取会话出错:', error);
          return;
        }
        
        if (data?.session) {
          console.log('[登录修复] 检测到用户已登录，但在登录页面，重定向到受保护页面');
          
          // 确认重定向前等待短暂延迟，确保会话完全同步
          setTimeout(() => {
            router.push('/protected');
          }, 300);
        }
      } catch (err) {
        console.error('[登录修复] 处理时出错:', err);
      }
    };
    
    checkAndFixLogin();
  }, [router, supabase]);
  
  // 此组件不渲染任何内容
  return null;
} 