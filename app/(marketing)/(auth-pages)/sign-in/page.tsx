import { FormMessage, Message } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import FixLogin from "@/app/auth/sign-in/fix-login";
import LoginForm from "./login-form";
import OAuthHandler from "./oauth-handler";

export default async function Login(props: { searchParams: Promise<Message> }) {
  const searchParams = await props.searchParams;
  
  return (
    <>
      {/* 添加登录修复组件，自动检测会话状态并重定向 */}
      <FixLogin />
      
      {/* 添加 OAuth 处理组件，处理 OAuth 重定向 */}
      <OAuthHandler />
      
      <Card className="w-full max-w-md border-none shadow-lg">
        <CardHeader className="space-y-1 text-center pb-0">
          <div className="mb-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
              <Lock className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">登录</h1>
          <p className="text-sm text-muted-foreground pt-1">
            还没有账号？{" "}
            <Link className="text-primary font-medium hover:underline" href="/sign-up">
              立即注册
            </Link>
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          {/* 使用客户端组件处理表单提交 */}
          <LoginForm message={searchParams} />
        </CardContent>
      </Card>
    </>
  );
}
