"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import UserNav from "@/components/user-nav";
import { ThemeProvider } from "next-themes";

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const supabase = createClient();

  // 验证用户是否已登录，未登录则重定向到登录页
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/sign-in");
      }
    };

    checkAuth();
  }, [router, supabase]);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <div className="relative min-h-screen">
        {/* 只保留用户信息和登出 */}
        <UserNav />
        
        <main className="min-h-screen pt-6">
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
} 