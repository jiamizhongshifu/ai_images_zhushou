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

// 使用时间戳生成唯一表单ID
const generateFormKey = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

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
  
  // 表单引用，用于手动处理表单提交
  const formRef = useRef<HTMLFormElement>(null);
  
  // 生成唯一的表单KEY
  const formKey = generateFormKey();
  
  // 处理登录成功后的重定向
  const redirectToProtected = () => {
    const loginTime = Date.now();
    
    // 清除所有登出标记并设置认证标记
    try {
      console.log('[登录表单] 设置认证状态并清除登出标记');
      
      // 1. 清除登出标记
      localStorage.removeItem('force_logged_out');
      sessionStorage.removeItem('isLoggedOut');
      
      // 2. 设置认证标记
      localStorage.setItem('auth_valid', 'true');
      localStorage.setItem('auth_time', loginTime.toString());
      localStorage.setItem('wasAuthenticated', 'true');
      sessionStorage.setItem('activeAuth', 'true');
      
      // 3. 直接设置认证cookie，确保所有页面立即识别登录状态
      const cookieOptions = '; path=/; max-age=86400; SameSite=Lax';
      document.cookie = `user_authenticated=true${cookieOptions}`;
      document.cookie = `force_login=true${cookieOptions}`;
      document.cookie = `auth_time=${loginTime}${cookieOptions}`;
      
      // 4. 清除所有登出相关cookie
      const expireOptions = '; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = `logged_out=${expireOptions}`;
      document.cookie = `force_logged_out=${expireOptions}`;
      document.cookie = `isLoggedOut=${expireOptions}`;
      
      // 5. 尝试在根域名上也清除cookie
      try {
        const domainParts = window.location.hostname.split('.');
        if (domainParts.length > 1) {
          const rootDomain = domainParts.slice(-2).join('.');
          document.cookie = `logged_out=${expireOptions}; domain=.${rootDomain}`;
          document.cookie = `force_logged_out=${expireOptions}; domain=.${rootDomain}`;
        }
      } catch (e) {
        console.warn('[登录表单] 清除根域名cookie出错:', e);
      }
      
      // 6. 使用完整URL调用API清除服务器端登出标记
      const apiBaseUrl = window.location.origin;
      fetch(`${apiBaseUrl}/api/auth/clear-logout-flags`, {
        method: 'POST',
        headers: {
          'Cache-Control': 'no-cache, no-store',
          'Pragma': 'no-cache'
        },
        credentials: 'include' // 确保包含cookie
      }).then(response => {
        if (response.ok) {
          console.log('[登录表单] 服务器端登出标记清除成功');
        } else {
          console.warn('[登录表单] 服务器端登出标记清除失败');
        }
      }).catch(error => {
        console.error('[登录表单] 清除服务器端登出标记出错:', error);
      });
      
      // 7. 检查Supabase会话状态
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          console.log('[登录表单] 验证Supabase会话有效');
        } else {
          console.warn('[登录表单] 未检测到有效Supabase会话，将通过URL参数强制登录');
        }
      }).catch(e => {
        console.error('[登录表单] 检查Supabase会话出错:', e);
      });
    } catch (error) {
      console.warn('[登录表单] 设置认证状态失败:', error);
    }
    
    // 确定重定向目标，添加更多参数确保认证状态正确传递
    let redirectTarget = `/protected?just_logged_in=true&login_time=${loginTime}&clear_logout_flags=true&force_login=true&auth_init=true`;
    
    // 如果存在重定向参数，优先使用该参数
    if (redirectParam) {
      // 检查是否为受保护路径，需要添加登录参数
      if (redirectParam.startsWith('/protected')) {
        redirectTarget = `${redirectParam}?just_logged_in=true&login_time=${loginTime}&force_login=true&auth_init=true`;
      } else {
        // 非受保护路径，直接跳转但仍添加认证参数
        redirectTarget = `${redirectParam}?force_login=true&login_time=${loginTime}`;
      }
      console.log(`[登录表单] 使用自定义重定向目标: ${redirectTarget}`);
    } else {
      console.log(`[登录表单] 使用默认保护页面重定向: ${redirectTarget}`);
    }
    
    // 等待较长时间确保设置操作完成
    setTimeout(() => {
      console.log('[登录表单] 重定向开始');
      // 使用window.location进行完全页面刷新，避免Next.js客户端路由可能的问题
      window.location.href = redirectTarget;
    }, 1200); // 增加等待时间到1200ms
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
      
      // 添加表单key到表单数据
      formData.append("formKey", formKey);
      
      console.log('[客户端登录] 准备提交登录请求');
      
      try {
        // 调用登录action
        await signInAction(formData);
        
        // 登录成功，重定向到受保护页面
        console.log('[客户端登录] 登录操作成功完成');
        redirectToProtected();
      } catch (error: any) {
        console.error("[客户端登录] 登录请求错误:", error);
        
        // 检查是否是重定向错误（这通常意味着登录成功）
        if (error.message && error.message.includes('NEXT_REDIRECT')) {
          console.log('[客户端登录] 检测到重定向响应，可能是登录成功');
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
      // 如果没有成功导航走，重置提交状态
      setIsSubmitting(false);
    }
  };

  return (
    <form 
      className="flex flex-col w-full space-y-6" 
      id={`login-form-${formKey}`} 
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