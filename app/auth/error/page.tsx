"use client";

import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, RefreshCw, Mail } from "lucide-react";

export default function AuthErrorPage() {
  const router = useRouter();
  const params = useSearchParams();
  
  // 获取错误信息
  const error = params?.get('error') ?? '';
  const errorCode = params?.get('error_code') ?? '';
  const errorDescription = params?.get('error_description') ?? '';
  
  // 获取用户邮箱（如果有）
  const email = params?.get('email') ?? '';
  
  // 处理重新发送验证邮件
  const handleResendEmail = async () => {
    if (!email) {
      router.push('/auth/sign-up');
      return;
    }
    
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      
      if (response.ok) {
        alert('验证邮件已重新发送，请查收');
      } else {
        throw new Error('重新发送失败');
      }
    } catch (error) {
      console.error('重新发送验证邮件失败:', error);
      alert('重新发送验证邮件失败，请重试');
    }
  };
  
  // 根据错误类型显示不同的提示信息
  const getErrorMessage = () => {
    switch (errorCode) {
      case 'otp_expired':
        return '验证链接已过期';
      case 'access_denied':
        return '验证链接无效';
      default:
        return '验证过程中出现错误';
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          
          <h1 className="text-2xl font-semibold tracking-tight">
            {getErrorMessage()}
          </h1>
          
          <p className="text-muted-foreground">
            {errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : '请尝试重新验证或注册'}
          </p>
        </div>
        
        <div className="flex flex-col space-y-4">
          {email && (
            <Button
              onClick={handleResendEmail}
              className="w-full"
              variant="outline"
            >
              <Mail className="mr-2 h-4 w-4" />
              重新发送验证邮件
            </Button>
          )}
          
          <Button
            onClick={() => router.push('/auth/sign-up')}
            className="w-full"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            重新注册
          </Button>
        </div>
      </Card>
    </div>
  )
} 