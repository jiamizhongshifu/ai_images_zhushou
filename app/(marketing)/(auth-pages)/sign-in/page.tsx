import { signInAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { Lock, Mail } from "lucide-react";

export default async function Login(props: { searchParams: Promise<Message> }) {
  const searchParams = await props.searchParams;
  return (
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
        <form className="flex flex-col w-full space-y-6">
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">电子邮箱</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
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
                  type="password"
                  name="password"
                  placeholder="请输入密码"
                  required
                  className="w-full pl-10"
                />
              </div>
            </div>
            <SubmitButton 
              pendingText="登录中..." 
              formAction={signInAction}
              className="w-full mt-6 py-5"
            >
              登录
            </SubmitButton>
            <FormMessage message={searchParams} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
