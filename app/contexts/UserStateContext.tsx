'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

interface UserStateContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshUserState: () => Promise<void>;
}

const UserStateContext = createContext<UserStateContextType>({
  isAuthenticated: false,
  isLoading: true,
  refreshUserState: async () => {},
});

export function UserStateProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const refreshUserState = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    } catch (error) {
      console.error('刷新用户状态时出错:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUserState();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setIsAuthenticated(!!session);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <UserStateContext.Provider value={{ isAuthenticated, isLoading, refreshUserState }}>
      {children}
    </UserStateContext.Provider>
  );
}

export function useUserState() {
  const context = useContext(UserStateContext);
  if (!context) {
    throw new Error('useUserState 必须在 UserStateProvider 内部使用');
  }
  return context;
} 