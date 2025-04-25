"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Coins, PlusCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CreditRechargeDialog from "@/components/payment/credit-recharge-dialog";
import { cn } from '@/lib/utils';
import { useUserState } from '@/app/components/providers/user-state-provider';
import { useToast } from '@/components/ui/use-toast';
import { creditService } from '@/utils/credit-service';

// 简化接口定义
interface UserCreditDisplayProps {
  className?: string;
}

export function UserCreditDisplay({ className }: UserCreditDisplayProps) {
  // 使用全局状态
  const { credits, isLoading, isAuthenticated, userInfoLoaded, triggerCreditRefresh } = useUserState();
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);
  const [refreshDisabled, setRefreshDisabled] = useState(false);
  // 添加本地状态用于保存最后已知的有效点数
  const [lastKnownCredits, setLastKnownCredits] = useState<number | null>(null);
  const [displayCredits, setDisplayCredits] = useState<number | null>(null);
  const { toast } = useToast();
  
  // 从credit-service直接获取缓存的点数，作为初始值和备份数据源
  useEffect(() => {
    try {
      const cachedCredits = creditService.getCachedCredits();
      if (cachedCredits !== null) {
        setLastKnownCredits(cachedCredits);
        // 如果还没有显示点数，则显示缓存的点数
        if (displayCredits === null) {
          setDisplayCredits(cachedCredits);
        }
      }
    } catch (e) {
      console.warn('[UserCreditDisplay] 获取缓存点数失败:', e);
    }
  }, []);
  
  // 监听全局点数变化
  useEffect(() => {
    // 当全局点数状态变化时，更新组件状态
    if (credits !== null) {
      setDisplayCredits(credits);
      setLastKnownCredits(credits);
    } else if (lastKnownCredits !== null && credits === null) {
      // 如果全局点数为空，但我们有最后已知的点数，则使用它
      setDisplayCredits(lastKnownCredits);
    }
  }, [credits, lastKnownCredits]);

  // 订阅点数变化事件
  useEffect(() => {
    const handleCreditsChange = (newCredits: number) => {
      if (newCredits !== null) {
        setDisplayCredits(newCredits);
        setLastKnownCredits(newCredits);
      }
    };

    // 添加事件监听
    const unsubscribe = creditService.onEvent('credits_changed', handleCreditsChange);
    
    return () => {
      // 移除事件监听
      unsubscribe();
    };
  }, []);
  
  // 处理刷新按钮点击 - 防抖控制
  const handleRefresh = useCallback(async () => {
    if (refreshDisabled || isLoading) return;
    
    console.log('[UserCreditDisplay] 用户手动刷新点数');
    setRefreshDisabled(true);
    
    // 保存上一次已知的点数，用于在刷新失败时显示
    const previousCredits = displayCredits;
    
    try {
      // 显示加载状态但保留当前显示的点数值
      const localLoading = true;
      
      // 先直接调用credit-service方法，尝试获取点数
      const fetchedCredits = await creditService.fetchCredits(true);
      if (fetchedCredits !== null) {
        setDisplayCredits(fetchedCredits);
        setLastKnownCredits(fetchedCredits);
        console.log('[UserCreditDisplay] 成功获取点数:', fetchedCredits);
      } else {
        // 如果获取失败，则尝试使用triggerCreditRefresh
        await triggerCreditRefresh();
        console.log('[UserCreditDisplay] 通过全局状态刷新点数');
      }
    } catch (error) {
      console.warn('[UserCreditDisplay] 刷新点数失败:', error);
      // 还原为上一次已知的点数
      if (previousCredits !== null) {
        setDisplayCredits(previousCredits);
      }
      
      // 显示错误提示
      toast({
        title: "刷新点数失败",
        description: "请稍后再试，或刷新页面",
        variant: "destructive",
        type: "error",
      });
    } finally {
      // 设置5秒防抖，避免频繁点击
      setTimeout(() => {
        setRefreshDisabled(false);
      }, 5000);
    }
  }, [triggerCreditRefresh, refreshDisabled, isLoading, toast, displayCredits]);

  // 处理充值按钮点击
  const handleRecharge = useCallback(() => {
    console.log('[UserCreditDisplay] 用户点击充值按钮');
    setShowCreditRechargeDialog(true);
  }, []);
  
  // 检查是否已登出 - 增加try/catch，防止访问存储出错
  const isLoggedOut = (() => {
    try {
      return typeof window !== 'undefined' && (
        localStorage.getItem('force_logged_out') === 'true' || 
        sessionStorage.getItem('isLoggedOut') === 'true'
      );
    } catch (e) {
      console.warn('[UserCreditDisplay] 访问存储失败:', e);
      return false;
    }
  })();
  
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
            
            {/* 点数显示，即使在加载时也显示最后已知的点数 */} 
            <span className="font-medium">
              {displayCredits !== null ? displayCredits : '...'}
            </span>
            
            {/* 加载指示器单独显示 */}
            {isLoading && (
              <Loader2 className="h-3 w-3 animate-spin ml-1" />
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
              credits={displayCredits || 0}
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