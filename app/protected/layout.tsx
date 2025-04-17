"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { authService } from "@/utils/auth-service";
import { Button } from '@/components/ui/button';
import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { useUserState } from '@/app/components/providers/user-state-provider';

export default function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useUserState();
  const [showAccessButton, setShowAccessButton] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
          <p className="mt-4 text-lg">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect('/sign-in');
  }

  if (showAccessButton) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">需要登录</h1>
          <p className="text-gray-600 mt-2">您需要登录才能访问此页面</p>
        </div>
        <Button onClick={() => router.push('/sign-in')} className="px-6 py-2">
          登录账户
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
          {children}
      </main>
    </div>
  );
} 