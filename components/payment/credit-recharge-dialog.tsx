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
  
  // 添加轮询订单状态的功能，确保在用户支付后立即更新UI
  const pollOrderStatus = async (orderNo: string, maxRetries = 5) => {
    console.log(`开始轮询订单 ${orderNo} 状态`);
    let retries = 0;
    
    // 轮询函数
    const checkStatus = async (): Promise<boolean> => {
      try {
        // 先尝试使用公共修复接口，确保订单已处理
        const fixRes = await fetch(`/api/payment/fix-public?order_no=${orderNo}`);
        if (fixRes.ok) {
          const fixData = await fixRes.json();
          if (fixData.success) {
            console.log(`订单 ${orderNo} 修复/检查成功:`, fixData.result);
            // 如果修复成功且点数已增加
            if (fixData.result && 
               (fixData.result.message?.includes('点数已增加') || 
                fixData.result.newCredits)) {
              return true;
            }
            // 如果订单已处理但可能点数未增加
            if (fixData.result && fixData.result.message?.includes('订单已处理')) {
              // 再次尝试标准检查接口
              const checkRes = await fetch(`/api/payment/check?order_no=${orderNo}`);
              if (checkRes.ok) {
                const checkData = await checkRes.json();
                if (checkData.success && checkData.order?.status === 'success') {
                  console.log(`订单 ${orderNo} 状态为成功`);
                  return true;
                }
              }
            }
          }
        }
        
        // 自增重试计数
        retries++;
        console.log(`订单 ${orderNo} 状态查询第${retries}次，未完成或失败`);
        
        if (retries >= maxRetries) {
          console.log(`订单 ${orderNo} 查询达到最大次数 ${maxRetries}，停止轮询`);
          return false;
        }
        
        // 延迟后再次检查
        await new Promise(resolve => setTimeout(resolve, 2000));
        return await checkStatus();
      } catch (error) {
        console.error(`轮询订单 ${orderNo} 状态出错:`, error);
        
        // 自增重试计数
        retries++;
        
        if (retries >= maxRetries) {
          console.log(`订单 ${orderNo} 查询达到最大次数 ${maxRetries}，停止轮询`);
          return false;
        }
        
        // 出错后延迟更长时间再试
        await new Promise(resolve => setTimeout(resolve, 3000));
        return await checkStatus();
      }
    };
    
    // 开始轮询
    return await checkStatus();
  };
  
  // 确保点数被刷新的多次尝试函数
  const ensureCreditsRefreshed = async () => {
    try {
      // 刷新方法，直接请求API获取最新点数
      const refreshCredits = async () => {
        try {
          const timestamp = new Date().getTime(); // 添加时间戳避免缓存
          const response = await fetch(`/api/credits/get?t=${timestamp}`, {
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          return response.ok;
        } catch (e) {
          console.error('刷新点数失败:', e);
          return false;
        }
      };
      
      // 立即刷新一次
      await refreshCredits();
      
      // 再延迟几次刷新，确保数据一致性
      setTimeout(() => refreshCredits(), 1000);
      setTimeout(() => refreshCredits(), 3000);
      setTimeout(() => refreshCredits(), 6000);
    } catch (error) {
      console.error('刷新用户点数失败:', error);
    }
  };
  
  // 改进处理支付结果
  const handlePaymentComplete = async (orderNo: string) => {
    // 先设置处理中状态
    setIsLoading(true);
    
    try {
      // 轮询订单状态，确保支付正确处理
      const success = await pollOrderStatus(orderNo);
      
      if (success) {
        // 确保多次刷新用户点数，防止缓存问题
        ensureCreditsRefreshed();
        
        // 显示成功消息
        setError('支付成功！点数已增加到您的账户');
        
        // 调用成功回调
        if (onSuccess) {
          onSuccess();
        }
      } else {
        // 支付可能未完成，但不确定，设置提示信息
        setError('支付状态未知，如果您已完成支付，点数将在稍后自动增加。若长时间未更新，请联系客服。');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('处理支付结果失败:', errorMessage);
      setError(`支付处理过程中出错: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 改进支付按钮点击处理
  const handlePayment = async () => {
    if (!selectedPackage) {
      setError('请选择充值套餐');
      return;
    }
    
    setError('');
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/payment/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: selectedPackage,
          paymentType
        }),
      });
      
      if (!response.ok) {
        throw new Error(`创建订单失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data && data.data.paymentUrl) {
        // 保存订单号以便后续跟踪
        const orderNo = data.data.orderNo;
        
        // 打开微信支付
        if (data.data.paymentUrl) {
          // 创建一个新窗口打开支付链接
          const paymentWindow = window.open(data.data.paymentUrl, '_blank');
          
          // 如果支付窗口成功打开，设置定时器轮询订单状态
          if (paymentWindow) {
            // 延时5秒开始轮询，通常用户需要一些时间完成支付
            setTimeout(() => {
              handlePaymentComplete(orderNo);
            }, 5000);
          } else {
            // 如果窗口被拦截，提示用户
            setError('支付窗口被拦截，请允许弹出窗口或直接访问支付链接');
            console.log('支付链接:', data.data.paymentUrl);
          }
        } else {
          setError('未获取到支付链接');
        }
      } else {
        setError(data.error || '创建支付订单失败');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('支付过程发生错误:', errorMessage);
      setError(`支付过程出错: ${errorMessage}`);
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