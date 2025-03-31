import { forgotPasswordAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { SmtpMessage } from "../smtp-message";
import { RotateCcw, Mail } from "lucide-react";

export default async function ForgotPassword(props: {
  searchParams: Promise<Message>;
}) {
  const searchParams = await props.searchParams;
  return (
    <>
      <Card className="w-full max-w-md border-none shadow-lg">
        <CardHeader className="space-y-1 text-center pb-0">
          <div className="mb-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
              <RotateCcw className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">重置密码</h1>
          <p className="text-sm text-muted-foreground pt-1">
            已记起密码？{" "}
            <Link className="text-primary font-medium hover:underline" href="/sign-in">
              返回登录
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
              <SubmitButton 
                formAction={forgotPasswordAction}
                className="w-full mt-6 py-5"
              >
                发送重置链接
              </SubmitButton>
              <p className="text-xs text-muted-foreground text-center mt-2">
                我们将发送一封包含密码重置链接的电子邮件到您的邮箱
              </p>
              <FormMessage message={searchParams} />
            </div>
          </form>
        </CardContent>
      </Card>
      <SmtpMessage />
    </>
  );
}
