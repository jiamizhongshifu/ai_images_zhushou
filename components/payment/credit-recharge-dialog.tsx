import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CreditCard, CheckCircle2 } from "lucide-react";
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
  
  // 轮询检查支付状态
  useEffect(() => {
    if (isCheckingPayment && orderNo) {
      const checkPaymentStatus = async () => {
        try {
          const response = await fetch(`/api/payment/check?orderNo=${orderNo}`);
          const data = await response.json();
          
          if (data.success && data.data.isPaid) {
            setPaymentSuccess(true);
            setIsCheckingPayment(false);
            
            // 支付成功后1.5秒关闭弹窗
            setTimeout(() => {
              onClose();
              if (onSuccess) onSuccess();
              router.refresh(); // 刷新页面更新点数
            }, 1500);
            
            return;
          }
          
          // 继续检查直到30次
          if (checkCount < 30) {
            setCheckCount(prev => prev + 1);
          } else {
            setIsCheckingPayment(false);
            setError('支付状态查询超时，请联系客服或刷新页面重试');
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