import { useUserState } from '@/app/components/providers/user-state-provider';

export interface UseUserCreditsResult {
  credits: number | null;
  isLoading: boolean;
  error: string | null;
  isCached: boolean;
  refetch: (showLoading?: boolean, forceRefresh?: boolean) => Promise<void>;
}

/**
 * 自定义Hook用于获取和管理用户点数，使用全局状态提供器
 */
export default function useUserCredits(): UseUserCreditsResult {
  const { credits, isLoading, refreshUserState } = useUserState();
  
  return {
    credits,
    isLoading,
    error: null, // 错误处理已在全局状态提供器中完成
    isCached: false, // 缓存管理已在全局状态提供器中处理
    refetch: (showLoading = true, forceRefresh = false) => 
      refreshUserState({ showLoading, forceRefresh })
  };
} 