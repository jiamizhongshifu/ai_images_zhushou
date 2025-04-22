"use client";

import { signInAction } from "@/app/actions";
import { type Message, FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useUserState } from '@/app/components/providers/user-state-provider';
import { forceSyncAuthState } from '@/utils/auth-service';
import { supabase } from '@/lib/supabaseClient';

// 使用稳定的表单ID，避免服务端和客户端渲染不一致
const LOGIN_FORM_ID = 'login-form-stable';

interface LoginFormProps {
  message: Message;
}

export default function LoginForm({ message }: LoginFormProps) {
  // 使用状态跟踪表单是否已提交
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams?.get('redirect') || null;
  // 引入用户状态提供者的状态更新函数
  const { refreshUserState } = useUserState();
  
  // 表单引用，用于手动处理表单提交
  const formRef = useRef<HTMLFormElement>(null);
  
  // 处理登录成功后的重定向
  const redirectToProtected = async () => {
    try {
      // 清除登出标记，确保不会被错误地识别为已登出状态
      console.log('[登录重定向] 尝试清除登出标记');
      
      // 先调用API清除cookie中的登出标记
      try {
        const response = await fetch('/api/auth/clear-logout-flags', {
          method: 'POST',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        
        if (response.ok) {
          console.log('[登录重定向] 成功清除登出标记cookies');
        } else {
          console.warn('[登录重定向] 清除登出标记失败:', response.status);
        }
      } catch (apiError) {
        console.warn('[登录重定向] 调用清除登出标记API出错:', apiError);
      }
      
      // 也尝试清除localStorage和sessionStorage中的登出标记
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('force_logged_out');
          localStorage.removeItem('logged_out');
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('isLoggedOut');
        }
      } catch (storageError) {
        console.warn('[登录重定向] 清除存储中的登出标记出错:', storageError);
      }

      // 同步认证状态
      await forceSyncAuthState();
      
      // 添加auth_session参数并重定向到受保护页面
      const targetUrl = redirectParam 
        ? `${redirectParam}?auth_session=${Date.now()}`
        : `/protected?auth_session=${Date.now()}`;
      
      // 使用强制刷新的方式重定向，确保所有状态都被重置
      // 这在浏览器扩展环境中特别重要
      window.location.href = targetUrl;
    } catch (error) {
      console.error('[登录重定向] 重定向过程中出错:', error);
      // 即使出错也尝试重定向
      window.location.href = redirectParam || '/protected';
    }
  };

  // 处理表单提交
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    // 如果已经在提交中，阻止重复提交
    if (isSubmitting) {
      event.preventDefault();
      return;
    }
    
    // 阻止默认表单提交行为
    event.preventDefault();
    setError(null);
    
    // 设置提交状态
    setIsSubmitting(true);
    
    try {
      // 获取表单数据
      const formData = new FormData(event.currentTarget);
      const email = formData.get('email') as string;
      const password = formData.get('password') as string;
      
      if (!email || !password) {
        setError('请输入邮箱和密码');
        setIsSubmitting(false);
        return;
      }
      
      // 添加固定表单id到表单数据
      formData.append("formKey", LOGIN_FORM_ID);
      
      console.log('[客户端登录] 准备提交登录请求');
      
      try {
        // 调用登录action
        const result = await signInAction(formData);
        
        // 登录成功，重定向到受保护页面
        console.log('[客户端登录] 登录操作成功完成');
        
        // 不管服务器端的重定向结果如何，我们都主动进行客户端重定向
        redirectToProtected();
        
      } catch (error: any) {
        console.error("[客户端登录] 登录请求错误:", error);
        
        // 检查是否是重定向错误（这通常意味着登录成功）
        if (error.message && error.message.includes('NEXT_REDIRECT')) {
          console.log('[客户端登录] 检测到重定向响应，执行客户端重定向');
          redirectToProtected();
          return;
        }
        
        // 其他错误，显示给用户
        setError(error.message || '登录过程中发生错误');
        localStorage.removeItem('auth_valid');
        localStorage.removeItem('auth_time');
      }
    } catch (error: any) {
      console.error("[客户端登录] 表单处理错误:", error);
      setError(error.message || '提交表单时发生错误');
      localStorage.removeItem('auth_valid');
      localStorage.removeItem('auth_time');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 处理Google登录
  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: 'select_account'
          }
        }
      });
      
      if (error) {
        throw error;
      }
    } catch (error: any) {
      console.error('[Google登录] 异常:', error);
      setError(error.message || 'Google登录过程中发生错误，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form 
      className="flex flex-col w-full space-y-6" 
      id={LOGIN_FORM_ID} 
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">电子邮箱</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input 
              id="email"
              name="email" 
              placeholder="your@email.com" 
              required 
              className="w-full pl-10"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="password">密码</Label>
            <Link
              className="text-xs text-primary hover:underline"
              href="/forgot-password"
            >
              忘记密码？
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              name="password"
              placeholder="请输入密码"
              required
              className="w-full pl-10"
            />
          </div>
        </div>
        
        {error && (
          <div className="text-red-500 text-sm mt-2">{error}</div>
        )}
        
        <Button 
          type="submit"
          className="w-full mt-6 py-5"
          disabled={isSubmitting}
        >
          {isSubmitting ? "登录中..." : "登录"}
        </Button>
        
        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border"></span>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 text-muted-foreground">或</span>
          </div>
        </div>
        
        <Button 
          type="button"
          variant="outline"
          className="w-full flex items-center justify-center gap-2 mt-2"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
        >
          <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
            <path fill="#4285F4" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"/>
          </svg>
          <span>使用 Google 登录</span>
        </Button>
        
        {!error && message && (
          <FormMessage message={message} />
        )}
      </div>
    </form>
  );
} 