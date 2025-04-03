import { useState, useEffect } from 'react';
import { CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CreditRechargeDialog from '@/components/payment/credit-recharge-dialog';
import { createClient } from '@/utils/supabase/client';

export default function UserCreditDisplay() {
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRechargeOpen, setIsRechargeOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  const fetchUserCredits = async () => {
    try {
      if (retryCount > 3) {
        console.log('[UserCredit] 达到最大重试次数，使用缓存数据');
        const cachedCredits = localStorage.getItem('user_credits');
        if (cachedCredits) {
          setCredits(parseInt(cachedCredits, 10));
          setIsLoading(false);
          return;
        }
      }
      
      setIsLoading(true);
      setError(null);
      
      console.log('[UserCredit] 开始获取用户点数');
      const response = await fetch('/api/credits/get');
      
      if (!response.ok) {
        throw new Error('获取点数失败');
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`[UserCredit] 成功获取用户点数: ${data.credits}`);
        setCredits(data.credits);
        // 缓存数据到本地存储
        localStorage.setItem('user_credits', data.credits.toString());
      } else {
        console.error(`[UserCredit] 获取点数响应错误: ${data.error}`);
        setError(data.error || '获取点数失败');
        
        // 尝试使用缓存数据
        const cachedCredits = localStorage.getItem('user_credits');
        if (cachedCredits) {
          console.log(`[UserCredit] 使用缓存点数: ${cachedCredits}`);
          setCredits(parseInt(cachedCredits, 10));
        }
      }
    } catch (error: any) {
      console.error('[UserCredit] 获取用户点数出错:', error);
      setError(error.message || '获取点数出错');
      
      // 当API请求失败时，尝试从localStorage获取缓存的积分
      const cachedCredits = localStorage.getItem('user_credits');
      if (cachedCredits) {
        console.log(`[UserCredit] 使用缓存点数: ${cachedCredits}`);
        setCredits(parseInt(cachedCredits, 10));
      }
      
      // 如果登录状态异常，尝试刷新
      if (retryCount < 3) {
        const authValid = localStorage.getItem('auth_valid');
        if (authValid === 'true') {
          console.log(`[UserCredit] 检测到认证状态，但获取点数失败，尝试刷新会话 (重试 ${retryCount + 1}/3)`);
          try {
            const supabase = createClient();
            await supabase.auth.refreshSession();
            console.log('[UserCredit] 会话刷新成功，重试获取点数');
            setRetryCount(retryCount + 1);
            // 等待一段时间后重试
            setTimeout(() => {
              fetchUserCredits();
            }, 1000);
            return; // 防止设置isLoading = false
          } catch (refreshError) {
            console.error('[UserCredit] 刷新会话失败:', refreshError);
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchUserCredits();
    
    // 每60秒刷新一次积分
    const intervalId = setInterval(() => {
      fetchUserCredits();
    }, 60000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  // 手动刷新积分
  const refreshCredits = () => {
    setRetryCount(0); // 重置重试计数
    fetchUserCredits();
  };
  
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
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 rounded-full"
                onClick={refreshCredits}
                title="刷新点数"
              >
                <RefreshCw className="h-3 w-3" />
                <span className="sr-only">刷新点数</span>
              </Button>
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
            </div>
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