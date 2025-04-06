"use client";

import { useState, useEffect } from 'react';
import { Coins, PlusCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authService } from '@/utils/auth-service';
import { cacheService } from '@/utils/cache-service';
import CreditRechargeDialog from "@/components/payment/credit-recharge-dialog";
import { cn } from '@/lib/utils';

// 点数响应类型
interface CreditsResponse {
  success: boolean;
  credits: number;
  error?: string;
}

export default function UserCreditDisplay({ className }: { className?: string }) {
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);
  
  // 获取用户点数的函数
  const fetchCredits = async (forceRefresh: boolean = false) => {
    try {
      // 正在更新时不重复获取
      if (isRefreshing) return;
      
      // 设置加载状态
      setIsRefreshing(true);
      
      // 检查认证状态
      if (!authService.isAuthenticated()) {
        console.log('[UserCredit] 用户未认证，跳过获取点数');
        setIsRefreshing(false);
        return;
      }
      
      // 缓存键
      const cacheKey = 'user-credits';
      
      // 强制刷新时跳过缓存
      if (forceRefresh) {
        cacheService.delete(cacheKey);
      }
      
      const fetchFromAPI = async (): Promise<CreditsResponse> => {
        console.log('[UserCredit] 从API获取点数');
        const response = await fetch('/api/credits/get');
        
        if (!response.ok) {
          throw new Error(`获取点数失败: HTTP ${response.status}`);
        }
        
        return await response.json();
      };
      
      // 使用缓存服务获取数据（30秒内有效）
      const data = await cacheService.getOrFetch<CreditsResponse>(
        cacheKey,
        fetchFromAPI,
        30 * 1000 // 30秒缓存
      );
      
      if (data.success) {
        console.log('[UserCredit] 成功获取用户点数:', data.credits);
        setCredits(data.credits);
      } else {
        console.error('[UserCredit] 获取点数失败:', data.error);
      }
    } catch (error) {
      console.error('[UserCredit] 获取点数出错:', error);
    } finally {
      // 无论结果如何，都取消加载状态
      setIsRefreshing(false);
    }
  };
  
  // 初始化加载
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchCredits();
      setIsLoading(false);
    };
    
    if (authService.isAuthenticated()) {
      loadData();
    }
    
    // 订阅认证状态变化
    const unsubscribe = authService.subscribe((authState) => {
      // 当认证状态发生变化且为已认证时，获取点数
      if (authState.isAuthenticated) {
        loadData();
      } else {
        // 未认证时清空点数
        setCredits(null);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  // 处理充值按钮点击
  const handleRecharge = () => {
    setShowCreditRechargeDialog(true);
  };
  
  // 充值成功回调
  const handleRechargeSuccess = async () => {
    // 强制刷新点数
    await fetchCredits(true);
  };
  
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
      />
    </div>
  );
}