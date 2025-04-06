"use client";

import { useState, useEffect } from 'react';
import { Coins, PlusCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { creditService } from '@/utils/credit-service';
import CreditRechargeDialog from "@/components/payment/credit-recharge-dialog";
import { cn } from '@/lib/utils';

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
  
  // 使用新的点数服务
  useEffect(() => {
    // 订阅点数状态变化
    const unsubscribe = creditService.subscribe((state) => {
      setCreditState(state);
    });
    
    // 组件卸载时取消订阅
    return () => {
      unsubscribe();
    };
  }, []);
  
  // 处理刷新点数
  const refreshCredits = async () => {
    await creditService.fetchCredits(true);
  };
  
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