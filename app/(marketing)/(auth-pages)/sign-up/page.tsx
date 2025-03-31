import { signUpAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { SmtpMessage } from "../smtp-message";
import { UserPlus, Mail, KeyRound } from "lucide-react";

export default async function Signup(props: {
  searchParams: Promise<Message>;
}) {
  const searchParams = await props.searchParams;
  if ("message" in searchParams) {
    return (
      <div className="w-full flex-1 flex items-center justify-center gap-2 p-4">
        <Card className="max-w-md w-full p-6 shadow-lg">
          <FormMessage message={searchParams} />
        </Card>
      </div>
    );
  }

  return (
    <>
      <Card className="w-full max-w-md border-none shadow-lg">
        <CardHeader className="space-y-1 text-center pb-0">
          <div className="mb-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">注册账号</h1>
          <p className="text-sm text-muted-foreground pt-1">
            已有账号？{" "}
            <Link className="text-primary font-medium hover:underline" href="/sign-in">
              立即登录
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
                <Label htmlFor="password">设置密码</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    name="password"
                    placeholder="请设置密码（至少6位）"
                    minLength={6}
                    required
                    className="w-full pl-10"
                  />
                </div>
              </div>
              <SubmitButton 
                formAction={signUpAction} 
                pendingText="注册中..."
                className="w-full mt-6 py-5"
              >
                注册账号
              </SubmitButton>
              <FormMessage message={searchParams} />
            </div>
          </form>
        </CardContent>
      </Card>
      <SmtpMessage />
    </>
  );
}
