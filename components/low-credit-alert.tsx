"use client";

import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CreditCard, AlertCircle } from 'lucide-react';
import CreditRechargeDialog from '@/components/payment/credit-recharge-dialog';

interface LowCreditAlertProps {
  credits: number | null;
  threshold?: number;  // 点数低于此阈值显示警告，默认为2
}

export default function LowCreditAlert({ credits, threshold = 2 }: LowCreditAlertProps) {
  const [isRechargeOpen, setIsRechargeOpen] = useState(false);
  const isLowCredits = credits !== null && credits <= threshold;
  
  if (!isLowCredits) {
    return null;
  }
  
  return (
    <>
      <Alert variant="destructive" className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <AlertCircle className="h-4 w-4 mr-2" />
          <AlertDescription>
            您的点数不足（剩余{credits}点），生成图片可能会失败。建议立即充值以继续使用。
          </AlertDescription>
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          className="ml-2 flex-shrink-0"
          onClick={() => setIsRechargeOpen(true)}
        >
          <CreditCard className="mr-2 h-4 w-4" />
          立即充值
        </Button>
      </Alert>
      
      <CreditRechargeDialog
        isOpen={isRechargeOpen}
        onClose={() => setIsRechargeOpen(false)}
      />
    </>
  );
} 