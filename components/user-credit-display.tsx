"use client";

import React, { useState, useCallback } from 'react';
import { Coins, PlusCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CreditRechargeDialog from "@/components/payment/credit-recharge-dialog";
import { cn } from '@/lib/utils';
import { useUserState } from '@/app/components/providers/user-state-provider';

// 简化接口定义
interface UserCreditDisplayProps {
  className?: string;
}

export function UserCreditDisplay({ className }: UserCreditDisplayProps) {
  // 只使用全局状态
  const { credits, isLoading, isAuthenticated, userInfoLoaded, triggerCreditRefresh } = useUserState();
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);
  const [refreshDisabled, setRefreshDisabled] = useState(false);
  
  // 处理刷新按钮点击 - 防抖控制
  const handleRefresh = useCallback(async () => {
    if (refreshDisabled || isLoading) return;
    
    console.log('[UserCreditDisplay] 用户手动刷新点数');
    setRefreshDisabled(true);
    
    try {
      await triggerCreditRefresh();
    } finally {
      // 设置5秒防抖，避免频繁点击
      setTimeout(() => {
        setRefreshDisabled(false);
      }, 5000);
    }
  }, [triggerCreditRefresh, refreshDisabled, isLoading]);

  // 处理充值按钮点击
  const handleRecharge = useCallback(() => {
    console.log('[UserCreditDisplay] 用户点击充值按钮');
    setShowCreditRechargeDialog(true);
  }, []);
  
  // 检查是否已登出
  const isLoggedOut = typeof window !== 'undefined' && (
    localStorage.getItem('force_logged_out') === 'true' || 
    sessionStorage.getItem('isLoggedOut') === 'true'
  );
  
  // 组合状态判断是否显示用户信息
  const shouldShowUserInfo = !isLoggedOut && (isAuthenticated || userInfoLoaded);

  // 渲染组件
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* 当检测到用户已登录时显示组件框架 */} 
      {shouldShowUserInfo && (
        <>
          <div className="flex items-center gap-1 text-sm">
            <Coins className="text-primary h-4 w-4" />
            
            {/* 点数加载中状态 */} 
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="font-medium">
                {/* 显示点数或点数加载中状态 */} 
                {credits !== null ? credits : '...'}
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
            disabled={isLoading || refreshDisabled}
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
          
          {showCreditRechargeDialog && (
            <CreditRechargeDialog
              isOpen={showCreditRechargeDialog}
              onClose={() => setShowCreditRechargeDialog(false)}
              credits={credits || 0}
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