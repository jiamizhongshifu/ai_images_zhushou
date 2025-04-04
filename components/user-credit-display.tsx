"use client";

import { useState, useEffect } from 'react';
import { Coins, PlusCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authService } from '@/utils/auth-service';
import CreditRechargeDialog from "@/components/payment/credit-recharge-dialog";

export default function UserCreditDisplay() {
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);
  
  // 获取用户点数的函数
  const fetchCredits = async () => {
    try {
      // 正在更新时不重复获取
      if (isRefreshing) return;
      
      // 设置加载状态
      setIsRefreshing(true);
      console.log('[UserCredit] 开始获取用户点数');
      
      // 检查认证状态
      if (!authService.isAuthenticated()) {
        console.log('[UserCredit] 用户未认证，跳过获取点数');
        setIsRefreshing(false);
        return;
      }
      
      // 获取用户点数
      const response = await fetch('/api/credits/get');
      
      if (!response.ok) {
        throw new Error(`获取点数失败: HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
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
  
  // 渲染组件
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 text-sm">
        <Coins className="text-primary h-4 w-4" />
        
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span className="font-medium">
            {credits !== null ? credits : '-'}
          </span>
        )}
        
        <span className="text-muted-foreground">点</span>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleRecharge}
        title="充值点数"
      >
        <PlusCircle className="h-3 w-3" />
      </Button>
      
      {/* 充值弹窗 */}
      <CreditRechargeDialog
        isOpen={showCreditRechargeDialog}
        onClose={() => setShowCreditRechargeDialog(false)}
        onSuccess={() => fetchCredits()}
      />
    </div>
  );
}