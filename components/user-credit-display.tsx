"use client";

import { useState, useRef, useEffect } from 'react';
import { Coins, PlusCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CreditRechargeDialog from "@/components/payment/credit-recharge-dialog";
import { cn } from '@/lib/utils';
import { useUserState } from '@/app/components/providers/user-state-provider';

export default function UserCreditDisplay({ className }: { className?: string }) {
  const { credits, isLoading, refreshUserState } = useUserState();
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);
  
  // 添加重试机制的状态和引用
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialRenderRef = useRef(true);
  const isRefreshingRef = useRef(false);
  
  // 处理刷新按钮点击
  const handleRefresh = async () => {
    console.log('[UserCreditDisplay] 用户手动刷新点数');
    isRefreshingRef.current = true;
    await refreshUserState({ forceRefresh: true });
    isRefreshingRef.current = false;
  };
  
  // 处理充值按钮点击
  const handleRecharge = () => {
    setShowCreditRechargeDialog(true);
  };
  
  // 充值成功回调
  const handleRechargeSuccess = async () => {
    // 强制刷新点数
    await refreshUserState({ forceRefresh: true });
  };
  
  // 自动重试获取积分
  useEffect(() => {
    // 页面加载完成后检查是否需要刷新积分
    const checkCreditsAfterLoad = () => {
      if (isInitialRenderRef.current) {
        isInitialRenderRef.current = false;
        
        // 页面完全加载后，如果积分为空则进行强制刷新
        if (credits === null) {
          console.log('[UserCreditDisplay] 初始加载后积分为空，尝试强制刷新');
          setTimeout(() => {
            if (!isRefreshingRef.current) {
              refreshUserState({ forceRefresh: true });
            }
          }, 800);
        }
      }
    };
    
    // 根据积分是否为空执行重试策略
    const executeRetryStrategy = () => {
      if (credits === null && retryCountRef.current < maxRetries) {
        const retryDelay = Math.min(1000 * (retryCountRef.current + 1), 3000);
        console.log(`[UserCreditDisplay] 积分为空，将在${retryDelay}ms后进行第${retryCountRef.current + 1}次重试`);
        
        // 清除之前的定时器
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        
        // 设置新的定时器
        retryTimeoutRef.current = setTimeout(() => {
          if (!isRefreshingRef.current) {
            console.log(`[UserCreditDisplay] 执行第${retryCountRef.current + 1}次积分重试获取`);
            retryCountRef.current++;
            refreshUserState({ forceRefresh: true });
          }
        }, retryDelay);
        
        return true;
      }
      return false;
    };
    
    // 初始加载检查
    checkCreditsAfterLoad();
    
    // 监听页面可见性变化，页面从隐藏变为可见时刷新积分
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[UserCreditDisplay] 页面变为可见，检查是否需要刷新积分');
        if (credits === null) {
          console.log('[UserCreditDisplay] 页面可见后积分为空，尝试刷新');
          if (!isRefreshingRef.current) {
            refreshUserState({ forceRefresh: true });
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 设置重试机制
    if (credits === null && !isLoading) {
      executeRetryStrategy();
    } else {
      // 如果已获取到积分，重置重试计数
      retryCountRef.current = 0;
    }
    
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [credits, isLoading, refreshUserState]);
  
  // 监听DOM加载完成
  useEffect(() => {
    const handleDOMContentLoaded = () => {
      console.log('[UserCreditDisplay] DOM内容加载完成，检查积分状态');
      if (credits === null && !isRefreshingRef.current) {
        setTimeout(() => {
          refreshUserState({ forceRefresh: true });
        }, 1000);
      }
    };
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);
    } else {
      handleDOMContentLoaded();
    }
    
    return () => {
      document.removeEventListener('DOMContentLoaded', handleDOMContentLoaded);
    };
  }, [credits, refreshUserState]);
  
  // 渲染组件
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex items-center gap-1 text-sm">
        <Coins className="text-primary h-4 w-4" />
        
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span className="font-medium">
            {credits !== null ? credits : '-'}
          </span>
        )}
        
        <span className="text-muted-foreground hidden sm:inline">点</span>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleRefresh}
        title="刷新点数"
        aria-label="刷新点数"
        disabled={isLoading}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleRecharge}
        title="充值点数"
        aria-label="充值点数"
      >
        <PlusCircle className="h-3.5 w-3.5" />
      </Button>
      
      {/* 充值弹窗 */}
      <CreditRechargeDialog
        isOpen={showCreditRechargeDialog}
        onClose={() => setShowCreditRechargeDialog(false)}
        onSuccess={handleRechargeSuccess}
        credits={credits || 0}
      />
    </div>
  );
}