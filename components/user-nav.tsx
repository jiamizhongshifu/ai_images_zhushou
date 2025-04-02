"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { User, LogOut, LogIn } from 'lucide-react';
import UserCreditDisplay from '@/components/user-credit-display';

export default function UserNav() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();
  
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsLoading(false);
    }
    
    getUser();
    
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );
    
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase.auth]);
  
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
    router.push('/sign-in');
  };
  
  if (isLoading) {
    return null; // 加载中不显示
  }
  
  return (
    <div className="fixed top-6 right-6 z-[5000] flex items-center gap-4">
      {user ? (
        <div className="flex items-center gap-4 bg-white/80 dark:bg-black/80 backdrop-blur-md rounded-full px-4 py-2 shadow-lg border border-gray-200 dark:border-gray-800">
          <UserCreditDisplay />
          
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
          
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">退出</span>
          </Button>
        </div>
      ) : (
        <Button
          asChild
          className="rounded-full bg-white/80 dark:bg-black/80 backdrop-blur-md shadow-lg border border-gray-200 dark:border-gray-800"
        >
          <Link href="/sign-in" className="gap-2">
            <LogIn className="h-4 w-4" />
            <span>登录</span>
          </Link>
        </Button>
      )}
    </div>
  );
} 