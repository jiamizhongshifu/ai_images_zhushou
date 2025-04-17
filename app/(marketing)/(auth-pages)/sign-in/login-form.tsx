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
      console.log('[登录表单] 开始重定向流程');
      
      // 1. 清除任何可能的登出标记
      localStorage.removeItem('force_logged_out');
      localStorage.removeItem('logged_out');
      sessionStorage.removeItem('isLoggedOut');
      document.cookie = 'force_logged_out=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      
      // 2. 设置认证标记
      const loginTime = Date.now().toString();
      localStorage.setItem('wasAuthenticated', 'true');
      localStorage.setItem('auth_time', loginTime);
      document.cookie = 'user_authenticated=true; path=/; max-age=86400';
      
      // 3. 获取重定向参数
      const urlParams = new URLSearchParams(window.location.search);
      const redirectParam = urlParams.get('redirect');
      
      // 4. 刷新用户状态
      await refreshUserState({ forceRefresh: true, showLoading: false });
      
      // 5. 确定重定向目标
      let redirectTarget = redirectParam || '/protected';
      
      // 6. 添加认证参数
      redirectTarget = `${redirectTarget}${redirectTarget.includes('?') ? '&' : '?'}auth_session=${loginTime}&auth_time=${loginTime}`;
      
      console.log(`[登录表单] 准备重定向到: ${redirectTarget}`);
      
      // 7. 使用window.location.href进行导航
      window.location.href = redirectTarget;
      
    } catch (error) {
      console.error('[登录表单] 重定向过程出错:', error);
      // 出错时使用基本重定向
      window.location.href = '/protected';
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
        
        {!error && message && (
          <FormMessage message={message} />
        )}
      </div>
    </form>
  );
} 