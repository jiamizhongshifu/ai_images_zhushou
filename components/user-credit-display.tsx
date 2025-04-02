import { useState, useEffect } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CreditRechargeDialog from '@/components/payment/credit-recharge-dialog';

export default function UserCreditDisplay() {
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRechargeOpen, setIsRechargeOpen] = useState(false);
  
  const fetchUserCredits = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/credits/get');
      
      if (!response.ok) {
        throw new Error('获取点数失败');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setCredits(data.credits);
      } else {
        setError(data.error || '获取点数失败');
      }
    } catch (error: any) {
      console.error('获取用户点数出错:', error);
      setError(error.message || '获取点数出错');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchUserCredits();
  }, []);
  
  return (
    <>
      <div className="flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <span className="text-sm font-medium">
              {credits !== null ? `${credits}点` : '获取点数中'}
            </span>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8 rounded-full"
              onClick={() => setIsRechargeOpen(true)}
              title="充值点数"
            >
              <CreditCard className="h-4 w-4" />
              <span className="sr-only">充值点数</span>
            </Button>
          </>
        )}
      </div>
      
      <CreditRechargeDialog
        isOpen={isRechargeOpen}
        onClose={() => setIsRechargeOpen(false)}
        onSuccess={() => fetchUserCredits()}
      />
    </>
  );
}