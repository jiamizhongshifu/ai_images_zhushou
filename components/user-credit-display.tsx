"use client";

import { useState, useEffect, useRef } from 'react';
import { Coins, PlusCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { creditService, CREDIT_EVENTS, onCreditEvent } from '@/utils/credit-service';
import CreditRechargeDialog from "@/components/payment/credit-recharge-dialog";
import { cn } from '@/lib/utils';
import { authService } from '@/utils/auth-service';
import { usePathname } from 'next/navigation';

// 点数状态接口
interface CreditState {
  credits: number | null;
  lastUpdate: number;
  isLoading: boolean;
}

export default function UserCreditDisplay({ className }: { className?: string }) {
  const [creditState, setCreditState] = useState<CreditState>({
    credits: null,
    lastUpdate: 0,
    isLoading: false
  });
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);
  const isFirstRender = useRef(true);
  const lastFetchTime = useRef(0);
  const pathname = usePathname(); // 添加路径名监听
  
  // 检查是否需要刷新
  const shouldRefresh = () => {
    const now = Date.now();
    // 如果从未获取过或超过2分钟未获取，则需要刷新
    const timeElapsed = now - lastFetchTime.current;
    const needsRefresh = lastFetchTime.current === 0 || timeElapsed > 120000;
    
    if (needsRefresh) {
      console.log(`[UserCreditDisplay] 需要刷新点数，已过时间: ${timeElapsed}ms`);
    }
    
    return needsRefresh;
  };
  
  // 直接从API获取点数
  const fetchCreditsDirectly = async (force = false) => {
    // 如果用户未登录，不进行获取
    if (!authService.isAuthenticated()) {
      console.log('[UserCreditDisplay] 用户未登录，跳过获取点数');
      return;
    }
    
    // 如果非强制且不需要刷新，则跳过
    if (!force && !shouldRefresh()) {
      console.log('[UserCreditDisplay] 跳过获取点数，上次获取时间较近');
      return;
    }
    
    try {
      console.log('[UserCreditDisplay] 直接从API获取点数');
      setCreditState(prev => ({ ...prev, isLoading: true }));
      
      // 添加时间戳和随机数参数，强制绕过缓存
      const timestamp = Date.now();
      const randomParam = Math.random().toString(36).substring(2, 15);
      
      const response = await fetch(`/api/credits/get?_t=${timestamp}&_r=${randomParam}`, {
        headers: { 
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`获取点数失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log('[UserCreditDisplay] 成功获取点数:', data.credits);
        setCreditState({
          credits: data.credits,
          lastUpdate: timestamp,
          isLoading: false
        });
        
        // 更新最后获取时间
        lastFetchTime.current = timestamp;
        
        // 同时更新creditService
        creditService.updateCredits(data.credits);
      } else {
        console.error('[UserCreditDisplay] 获取点数失败:', data.error);
        setCreditState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('[UserCreditDisplay] 获取点数出错:', error);
      setCreditState(prev => ({ ...prev, isLoading: false }));
    }
  };
  
  // 强制刷新点数的方法
  const refreshCredits = async () => {
    console.log('[UserCreditDisplay] 用户手动刷新点数');
    try {
      // 强制刷新，直接从API获取
      await fetchCreditsDirectly(true);
    } catch (error) {
      console.error('[UserCreditDisplay] 刷新点数失败:', error);
    }
  };
  
  // 监听路径变化 - 页面跳转时刷新点数
  useEffect(() => {
    console.log(`[UserCreditDisplay] 检测到路径变化: ${pathname}`);
    
    // 添加一个短暂延迟，确保页面已完全加载后才获取点数
    const timer = setTimeout(() => {
      if (authService.isAuthenticated()) {
        console.log('[UserCreditDisplay] 页面跳转，立即刷新点数');
        fetchCreditsDirectly(true);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [pathname]);
  
  // 添加页面加载事件监听，确保页面加载完成后获取点数
  useEffect(() => {
    const handleLoad = () => {
      console.log('[UserCreditDisplay] 页面加载完成，检查点数');
      if (authService.isAuthenticated() && (creditState.credits === null || shouldRefresh())) {
        fetchCreditsDirectly(true);
      }
    };
    
    // 如果页面已加载完成，立即执行一次
    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, []);
  
  // 监听登录状态变化，登录后立即刷新点数
  useEffect(() => {
    console.log('[UserCreditDisplay] 设置认证状态监听器');

    // 立即检查当前认证状态，确保组件挂载时立即获取点数
    if (authService.isAuthenticated()) {
      console.log('[UserCreditDisplay] 组件挂载时发现用户已登录，立即刷新点数');
      fetchCreditsDirectly(true);
    }
    
    const unsubscribe = authService.subscribe((authState) => {
      console.log('[UserCreditDisplay] 认证状态变化:', authState.isAuthenticated ? '已登录' : '未登录');
      
      if (authState.isAuthenticated) {
        console.log('[UserCreditDisplay] 检测到用户登录，立即刷新点数');
        fetchCreditsDirectly(true);
      } else {
        console.log('[UserCreditDisplay] 检测到用户登出，清空点数显示');
        setCreditState({
          credits: null,
          lastUpdate: Date.now(),
          isLoading: false
        });
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  // 监听点数变化事件
  useEffect(() => {
    console.log('[UserCreditDisplay] 设置点数事件监听器');
    
    // 监听点数变化事件
    const unsubscribeChanged = onCreditEvent(CREDIT_EVENTS.CREDITS_CHANGED, (state: CreditState) => {
      console.log('[UserCreditDisplay] 收到点数变化事件:', state);
      setCreditState(state);
      lastFetchTime.current = state.lastUpdate;
    });
    
    // 监听需要刷新点数的事件
    const unsubscribeRefresh = onCreditEvent(CREDIT_EVENTS.CREDITS_REFRESH_NEEDED, () => {
      console.log('[UserCreditDisplay] 收到点数刷新请求事件');
      fetchCreditsDirectly(true);
    });
    
    return () => {
      unsubscribeChanged();
      unsubscribeRefresh();
    };
  }, []);
  
  // 常规获取点数逻辑
  useEffect(() => {
    // 添加页面可见性变化监听，但增加限流
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && shouldRefresh() && authService.isAuthenticated()) {
        console.log('[UserCreditDisplay] 页面变为可见且需要刷新，获取点数');
        fetchCreditsDirectly();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 每3分钟自动刷新一次点数，而不是30秒
    const intervalId = setInterval(() => {
      if (shouldRefresh() && authService.isAuthenticated()) {
        console.log('[UserCreditDisplay] 定时刷新点数');
        fetchCreditsDirectly();
      }
    }, 180000); // 3分钟
    
    // 组件卸载时取消事件监听和定时器
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, []);
  
  // 处理充值按钮点击
  const handleRecharge = () => {
    setShowCreditRechargeDialog(true);
  };
  
  // 充值成功回调
  const handleRechargeSuccess = async () => {
    // 强制刷新点数
    await refreshCredits();
  };
  
  // 渲染组件
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex items-center gap-1 text-sm">
        <Coins className="text-primary h-4 w-4" />
        
        {creditState.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span className="font-medium">
            {creditState.credits !== null ? creditState.credits : '-'}
          </span>
        )}
        
        <span className="text-muted-foreground hidden sm:inline">点</span>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={refreshCredits}
        title="刷新点数"
        aria-label="刷新点数"
      >
        <RefreshCw className="h-3.5 w-3.5" />
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
        credits={creditState.credits || 0}
      />
    </div>
  );
}