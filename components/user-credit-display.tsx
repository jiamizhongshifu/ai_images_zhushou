"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Coins, PlusCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CreditRechargeDialog from "@/components/payment/credit-recharge-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUserState } from '@/app/components/providers/user-state-provider';
import { authService, forceSyncAuthState } from '@/utils/auth-service';
import { fetchCredits } from '@/utils/credit-service';
import { limitRequest, REQUEST_KEYS } from '@/utils/request-limiter';

// 简化接口定义
interface UserCreditDisplayProps {
  className?: string;
}

export function UserCreditDisplay({ className }: UserCreditDisplayProps) {
  const { credits, isLoading, refreshUserState, isAuthenticated } = useUserState();
  // 添加本地积分状态，避免依赖全局状态
  const [localCredits, setLocalCredits] = useState<number | null>(null);
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  
  // 使用ref而非state存储控制数据，避免触发重新渲染
  const lastRefreshTimeRef = useRef<number>(0);
  const refreshAttemptRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  const authChangedRef = useRef(false);
  
  // 配置常量 - 使用较长的时间减少请求
  const REFRESH_COOLDOWN = 15000; // 15秒冷却时间
  const MAX_REFRESH_ATTEMPTS = 5; // 增加最大尝试次数
  
  // 获取积分的安全方法，使用请求限制器
  const fetchCreditsWithLimit = useCallback(async (force: boolean = false): Promise<number | null> => {
    try {
      // 强制同步认证状态，确保组件拥有最新的认证信息
      forceSyncAuthState();
      
      if (!authService.isAuthenticated()) {
        console.log('[UserCreditDisplay] 用户未认证，不获取积分');
        return null;
      }
      
      // 使用请求限制器，复用进行中的请求并限制频率
      return await limitRequest(
        REQUEST_KEYS.CREDITS,
        () => fetchCredits(force),
        REFRESH_COOLDOWN,
        force
      );
    } catch (error) {
      if ((error as Error).message.includes('冷却时间内')) {
        // 这是预期内的错误，使用现有积分
        return localCredits || credits;
      }
      console.error('[UserCreditDisplay] 获取积分失败:', error);
      return null;
    }
  }, [localCredits, credits]);
  
  // 处理刷新按钮点击 - 保持原有实现，但增加安全检查
  const handleRefresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < REFRESH_COOLDOWN) {
      console.log('[UserCreditDisplay] 刷新频率过快，跳过此次请求');
      return;
    }
    
    console.log('[UserCreditDisplay] 用户手动刷新点数');
    setLocalLoading(true);
    lastRefreshTimeRef.current = now;
    
    try {
      // 强制同步认证状态
      forceSyncAuthState();
      
      if (!authService.isAuthenticated()) {
        console.log('[UserCreditDisplay] 刷新时检测到用户未认证');
        setLocalCredits(null);
        return;
      }
      
      const result = await fetchCreditsWithLimit(true);
      if (result !== null) {
        // 只在真正获取到新数据时更新本地状态
        setLocalCredits(result);
      } else {
        // 回退到全局状态更新
        await refreshUserState({ forceRefresh: true });
      }
    } catch (error) {
      console.error('[UserCreditDisplay] 刷新点数失败:', error);
    } finally {
      setLocalLoading(false);
    }
  }, [fetchCreditsWithLimit, refreshUserState]);
  
  // 处理充值按钮点击 - 保持不变
  const handleRecharge = useCallback(() => {
    console.log('[UserCreditDisplay] 用户点击充值按钮');
    setShowCreditRechargeDialog(true);
  }, []);
  
  // 检测认证状态变化
  useEffect(() => {
    console.log('[UserCreditDisplay] 设置认证状态监听');
    
    // 强制同步认证状态，确保组件拥有最新的认证信息
    forceSyncAuthState();
    setAuthChecked(true);
    
    // 添加认证状态变化监听
    const unsubscribe = authService.subscribe((state) => {
      console.log('[UserCreditDisplay] 认证状态变化:', state.isAuthenticated);
      
      if (state.isAuthenticated) {
        if (!authChangedRef.current) {
          authChangedRef.current = true;
          console.log('[UserCreditDisplay] 检测到用户登录，立即获取积分');
          
          // 登录后立即尝试获取积分
          setTimeout(() => {
            fetchCreditsWithLimit(true)
              .then(result => {
                if (result !== null) {
                  setLocalCredits(result);
                }
              })
              .catch(error => {
                console.error('[UserCreditDisplay] 认证状态变化后获取积分失败:', error);
              });
          }, 1000); // 短暂延迟确保认证状态已完全更新
        }
      } else {
        // 退出登录时清空积分
        setLocalCredits(null);
        authChangedRef.current = false;
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [fetchCreditsWithLimit]);
  
  // 首次加载和认证状态变化时获取积分
  useEffect(() => {
    if (!isAuthenticated || !authChecked) {
      // 如果未认证或认证状态未检查，不获取积分
      if (localCredits !== null) {
        setLocalCredits(null);
      }
      return;
    }
    
    // 只在首次认证后执行一次初始化
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      
      const initializeCredits = async () => {
        console.log('[UserCreditDisplay] 首次加载，初始化积分');
        
        // 如果已有全局积分，直接使用
        if (credits !== null) {
          console.log('[UserCreditDisplay] 使用现有全局积分:', credits);
          setLocalCredits(credits);
          return;
        }
        
        // 尝试获取积分的函数
        const tryFetchCredits = async (attempt: number) => {
          if (attempt >= MAX_REFRESH_ATTEMPTS) {
            console.log('[UserCreditDisplay] 达到最大尝试次数，停止');
            return;
          }
          
          try {
            setLocalLoading(true);
            const result = await fetchCreditsWithLimit(attempt > 0);
            
            if (result !== null) {
              setLocalCredits(result);
              console.log('[UserCreditDisplay] 成功获取积分:', result);
            } else if (attempt < MAX_REFRESH_ATTEMPTS - 1) {
              // 延迟后重试，增加延迟时间
              setTimeout(() => tryFetchCredits(attempt + 1), 1000 * (attempt + 1));
            }
          } catch (error) {
            console.error(`[UserCreditDisplay] 第${attempt+1}次尝试失败:`, error);
            // 尝试全局状态更新
            if (attempt === MAX_REFRESH_ATTEMPTS - 1) {
              try {
                await refreshUserState({ forceRefresh: true });
              } catch (e) {
                console.error('[UserCreditDisplay] 全局状态更新失败:', e);
              }
            } else {
              // 延迟后重试
              setTimeout(() => tryFetchCredits(attempt + 1), 1000 * (attempt + 1));
            }
          } finally {
            setLocalLoading(false);
          }
        };
        
        // 开始首次尝试
        tryFetchCredits(0);
      };
      
      initializeCredits();
    }
  }, [isAuthenticated, credits, refreshUserState, fetchCreditsWithLimit, authChecked]);
  
  // 监听全局积分变化
  useEffect(() => {
    if (credits !== null && credits !== localCredits) {
      console.log('[UserCreditDisplay] 同步全局积分到本地:', credits);
      setLocalCredits(credits);
    }
  }, [credits, localCredits]);
  
  // 渲染组件 - 优先使用本地积分，并简化刷新逻辑
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {authService.isAuthenticated() && (
        <>
          <div className="flex items-center gap-1 text-sm">
            <Coins className="text-primary h-4 w-4" />
            
            {isLoading || localLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="font-medium">
                {localCredits !== null ? localCredits : (credits !== null ? credits : '...')}
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
            disabled={localLoading || isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", (isLoading || localLoading) && "animate-spin")} />
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
              credits={localCredits || credits || 0}
              onSuccess={(newCredits) => {
                console.log('[UserCreditDisplay] 充值成功，新点数:', newCredits);
                setLocalCredits(newCredits);
                refreshUserState({ forceRefresh: true });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}