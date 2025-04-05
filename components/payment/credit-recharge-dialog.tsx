import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CreditCard, CheckCircle2, RefreshCw } from "lucide-react";
import { CREDIT_PACKAGES, PaymentType } from '@/utils/payment';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CreditRechargeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreditRechargeDialog({ isOpen, onClose, onSuccess }: CreditRechargeDialogProps) {
  const router = useRouter();
  const [selectedPackage, setSelectedPackage] = useState(CREDIT_PACKAGES[0].id);
  const [paymentType, setPaymentType] = useState<PaymentType>(PaymentType.ALIPAY);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 检查URL中是否有订单参数，并处理支付结果轮询
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  
  // 获取URL中的订单参数
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const order = urlParams.get('order_no');
      if (order) {
        setOrderNo(order);
        // 不需要设置isOpen，因为它是一个props
        setIsCheckingPayment(true);
        // 清除URL参数
        setTimeout(() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('order_no');
          window.history.replaceState({}, document.title, url.toString());
        }, 100);
      }
    }
  }, []);
  
  // 添加强制刷新点数状态的函数
  const forceRefreshCredits = async () => {
    try {
      console.log('手动强制刷新点数...');
      
      // 清除可能的缓存参数
      const timestamp = Date.now();
      const response = await fetch(`/api/credits/get?_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('强制刷新点数成功:', data.credits);
          // 这里不直接更新状态，而是通过刷新页面来获取最新状态
        }
      }
    } catch (error) {
      console.error('强制刷新点数失败:', error);
    }
  };
  
  // 轮询检查支付状态
  useEffect(() => {
    if (isCheckingPayment && orderNo) {
      const checkPaymentStatus = async () => {
        try {
          // 获取当前URL的查询参数，可能包含支付平台返回的信息
          const currentUrl = new URL(window.location.href);
          // 扩展参数列表，包含可能的微信支付参数
          const paymentKeys = [
            'trade_no', 'out_trade_no', 'trade_status', 'sign', 'pid', 'type', 'money',
            'transaction_id', 'status', 'pay_status', 'result', 'return_code', 'result_code',
            'order_no'
          ];
          const paymentParams = new URLSearchParams();
          
          // 添加订单号
          paymentParams.append('orderNo', orderNo);
          
          // 添加可能存在的支付回调参数
          paymentKeys.forEach(key => {
            const value = currentUrl.searchParams.get(key);
            if (value) {
              paymentParams.append(key, value);
            }
          });

          // 添加一个随机参数，避免缓存
          paymentParams.append('_t', Date.now().toString());
          
          // 调用检查接口，传入所有相关参数
          const response = await fetch(`/api/payment/check?${paymentParams.toString()}`);
          const data = await response.json();
          
          console.log('支付检查返回结果:', data);
          
          if (data.success && data.data.isPaid) {
            console.log('检测到支付成功，更新UI状态');
            setPaymentSuccess(true);
            setIsCheckingPayment(false);
            
            // 强制刷新整个页面以获取最新点数
            // 先尝试强制刷新点数
            await forceRefreshCredits();
            
            // 创建刷新页面的函数，采用延迟执行
            const refreshPage = () => {
              console.log('支付成功，刷新页面...');
              window.location.href = '/protected'; // 使用完整路径，避免参数传递
            };
            
            // 1.5秒后刷新页面
            setTimeout(refreshPage, 1500);
            
            return;
          }
          
          // 继续检查直到30次
          if (checkCount < 30) {
            setCheckCount(prev => prev + 1);
          } else {
            setIsCheckingPayment(false);
            setError('支付状态查询超时，请刷新页面或点击"手动刷新"按钮重试');
          }
        } catch (error) {
          console.error('检查支付状态失败:', error);
          setIsCheckingPayment(false);
          setError('检查支付状态失败，请刷新页面重试');
        }
      };
      
      const timer = setTimeout(checkPaymentStatus, 1000);
      return () => clearTimeout(timer);
    }
  }, [isCheckingPayment, orderNo, checkCount, onClose, onSuccess, router]);
  
  // 添加手动刷新支付状态功能
  const handleManualRefresh = () => {
    if (!orderNo) return;
    
    setError(null);
    setCheckCount(0);
    setIsCheckingPayment(true);
  };
  
  // 处理支付请求
  const handlePayment = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/payment/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          packageId: selectedPackage,
          paymentType
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.data.paymentUrl) {
        // 跳转到支付URL
        window.location.href = data.data.paymentUrl;
      } else {
        setError(data.error || '创建支付请求失败');
      }
    } catch (error: any) {
      console.error('支付请求失败:', error);
      setError(error.message || '支付请求失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(isDialogOpen: boolean) => !isLoading && !isCheckingPayment && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>充值点数</DialogTitle>
          <DialogDescription>
            选择充值套餐，为您的创作加油
          </DialogDescription>
        </DialogHeader>
        
        {/* 支付状态检查 */}
        {isCheckingPayment && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
            <p className="text-lg font-medium">支付验证中...</p>
            <p className="text-sm text-muted-foreground mt-1">请稍候，正在检查支付状态</p>
            {checkCount > 5 && (
              <p className="text-sm text-muted-foreground mt-4">如果您已完成支付，请稍等片刻</p>
            )}
            {checkCount > 15 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">长时间未收到支付结果？</p>
                <Button onClick={handleManualRefresh} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  手动刷新
                </Button>
              </div>
            )}
          </div>
        )}
        
        {/* 支付成功 */}
        {paymentSuccess && (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <p className="text-lg font-medium">支付成功！</p>
            <p className="text-sm text-muted-foreground mt-1">
              您的点数已充值成功，即将返回
            </p>
          </div>
        )}
        
        {/* 套餐选择 */}
        {!isCheckingPayment && !paymentSuccess && (
          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-3">
              <h3 className="text-sm font-medium">选择充值套餐</h3>
              <div className="grid grid-cols-2 gap-3">
                {CREDIT_PACKAGES.map((pkg) => (
                  <Button
                    key={pkg.id}
                    variant={selectedPackage === pkg.id ? "default" : "outline"}
                    className="flex flex-col h-auto p-4"
                    onClick={() => setSelectedPackage(pkg.id)}
                  >
                    <span className="text-lg font-bold">{pkg.credits}点</span>
                    <span className="text-sm font-medium">¥{pkg.price}</span>
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="space-y-3">
              <h3 className="text-sm font-medium">选择支付方式</h3>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={paymentType === PaymentType.ALIPAY ? "default" : "outline"}
                  className="justify-between"
                  onClick={() => setPaymentType(PaymentType.ALIPAY)}
                >
                  <span>支付宝</span>
                  <CreditCard className="h-4 w-4" />
                </Button>
                <Button
                  variant={paymentType === PaymentType.WXPAY ? "default" : "outline"}
                  className="justify-between"
                  onClick={() => setPaymentType(PaymentType.WXPAY)}
                >
                  <span>微信支付</span>
                  <CreditCard className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
        
        <DialogFooter>
          {!isCheckingPayment && !paymentSuccess && (
            <>
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                取消
              </Button>
              <Button 
                onClick={handlePayment} 
                disabled={isLoading || !selectedPackage}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                确认支付
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 