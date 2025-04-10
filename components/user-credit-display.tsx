"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  // 直接从 useUserState 获取所需状态和触发器
  const { credits, isLoading, isAuthenticated, triggerCreditRefresh } = useUserState();
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);

  // 处理刷新按钮点击 - 直接调用上下文的触发器
  const handleRefresh = useCallback(async () => {
    console.log('[UserCreditDisplay] 用户手动刷新点数');
    // 直接调用 UserStateProvider 提供的强制刷新函数
    await triggerCreditRefresh();
  }, [triggerCreditRefresh]);

  // 处理充值按钮点击 - 保持不变
  const handleRecharge = useCallback(() => {
    console.log('[UserCreditDisplay] 用户点击充值按钮');
    setShowCreditRechargeDialog(true);
  }, []);

  // 渲染组件 - 直接使用 useUserState 的状态
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* 使用上下文提供的 isAuthenticated */} 
      {isAuthenticated && (
        <>
          <div className="flex items-center gap-1 text-sm">
            <Coins className="text-primary h-4 w-4" />
            
            {/* 使用上下文提供的 isLoading */} 
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="font-medium">
                {/* 直接使用上下文提供的 credits */} 
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
            disabled={isLoading} // 使用上下文的 isLoading
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
              credits={credits || 0} // 使用上下文的 credits
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