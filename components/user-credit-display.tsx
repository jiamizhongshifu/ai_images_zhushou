"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Coins, PlusCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CreditRechargeDialog from "@/components/payment/credit-recharge-dialog";
import { cn } from '@/lib/utils';
import { useUserState } from '@/app/components/providers/user-state-provider';
import { createClient } from '@/utils/supabase/client';

// 简化接口定义
interface UserCreditDisplayProps {
  className?: string;
}

export function UserCreditDisplay({ className }: UserCreditDisplayProps) {
  // 直接从 useUserState 获取所需状态和触发器
  const { credits, isLoading, isAuthenticated, userInfoLoaded, triggerCreditRefresh } = useUserState();
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);
  
  // 添加本地状态，确保组件自身能判断用户登录状态
  const [localUserLoaded, setLocalUserLoaded] = useState(false);
  const [localCredits, setLocalCredits] = useState<number | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  
  // 组件挂载时立即检查当前用户和获取积分
  useEffect(() => {
    const checkLocalSession = async () => {
      const supabase = createClient();
      try {
        setLocalLoading(true);
        
        // 检查当前用户
        const { data, error } = await supabase.auth.getUser();
        
        if (data && data.user) {
          console.log('[UserCreditDisplay] 组件挂载时检测到用户:', data.user.id);
          setLocalUserLoaded(true);
          
          // 直接获取点数
          try {
            const response = await fetch('/api/credits/get?_t=' + Date.now(), { 
              headers: { 'Cache-Control': 'no-cache' },
              credentials: 'include'
            });
            if (response.ok) {
              const data = await response.json();
              if (data.success && typeof data.credits === 'number') {
                console.log('[UserCreditDisplay] 组件独立获取点数成功:', data.credits);
                setLocalCredits(data.credits);
              }
            }
          } catch (e) {
            console.warn('[UserCreditDisplay] 组件独立获取点数失败:', e);
          }
        } else {
          console.log('[UserCreditDisplay] 组件挂载时未检测到用户');
        }
      } catch (e) {
        console.error('[UserCreditDisplay] 检查会话出错:', e);
      } finally {
        setLocalLoading(false);
      }
    };
    
    checkLocalSession();
  }, []);
  
  // 同步全局状态到本地状态
  useEffect(() => {
    if (credits !== null) {
      setLocalCredits(credits);
    }
  }, [credits]);

  // 处理刷新按钮点击 - 直接调用上下文的触发器
  const handleRefresh = useCallback(async () => {
    console.log('[UserCreditDisplay] 用户手动刷新点数');
    setLocalLoading(true);
    
    try {
      // 直接调用 UserStateProvider 提供的强制刷新函数
      await triggerCreditRefresh();
    } finally {
      setLocalLoading(false);
    }
  }, [triggerCreditRefresh]);

  // 处理充值按钮点击 - 保持不变
  const handleRecharge = useCallback(() => {
    console.log('[UserCreditDisplay] 用户点击充值按钮');
    setShowCreditRechargeDialog(true);
  }, []);
  
  // 当前正在加载
  const isCurrentlyLoading = isLoading || localLoading;
  
  // 组合状态判断是否显示用户信息
  const shouldShowUserInfo = isAuthenticated || userInfoLoaded || localUserLoaded;
  
  // 使用本地积分或全局积分
  const displayCredits = localCredits !== null ? localCredits : credits;

  // 渲染组件 - 直接使用 useUserState 的状态
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* 当检测到用户已登录时显示组件框架 */} 
      {shouldShowUserInfo && (
        <>
          <div className="flex items-center gap-1 text-sm">
            <Coins className="text-primary h-4 w-4" />
            
            {/* 点数加载中状态 */} 
            {isCurrentlyLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="font-medium">
                {/* 显示点数或点数加载中状态 */} 
                {displayCredits !== null ? displayCredits : '...'}
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
            disabled={isCurrentlyLoading} // 使用当前加载状态
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isCurrentlyLoading && "animate-spin")} />
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
          
          {showCreditRechargeDialog && (
            <CreditRechargeDialog
              isOpen={showCreditRechargeDialog}
              onClose={() => setShowCreditRechargeDialog(false)}
              credits={displayCredits || 0} // 使用显示积分
              // 充值成功后，调用 triggerCreditRefresh
              onSuccess={async () => {
                console.log('[UserCreditDisplay] 充值成功，触发全局积分刷新');
                await triggerCreditRefresh();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}