"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

// 生成随机字符串作为 code verifier
function generateCodeVerifier(length: number) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function GoogleSignInButton() {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      console.log('[GoogleSignIn] 开始谷歌登录流程');

      // 生成 code verifier 并存储
      const codeVerifier = generateCodeVerifier(128);
      sessionStorage.setItem('codeVerifier', codeVerifier);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          skipBrowserRedirect: false,
        },
      });

      if (error) {
        console.error('[GoogleSignIn] 谷歌登录错误:', error);
        toast.error('登录失败: ' + error.message);
        return;
      }

      console.log('[GoogleSignIn] 登录流程启动成功，等待重定向');
      
    } catch (error) {
      console.error('[GoogleSignIn] 谷歌登录过程出错:', error);
      toast.error('登录过程中出现错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      type="button"
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-2"
      onClick={handleGoogleSignIn}
    >
      {isLoading ? (
        <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
      ) : (
        <Image
          src="/google.svg"
          alt="Google Logo"
          width={20}
          height={20}
        />
      )}
      使用谷歌账号登录
    </Button>
  );
} 