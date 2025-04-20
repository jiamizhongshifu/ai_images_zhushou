import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CreditCard, CheckCircle2, RefreshCw, History, Clock } from "lucide-react";
import { CREDIT_PACKAGES, PaymentType } from '@/utils/payment';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import OrderHistoryDialog from '@/components/payment/order-history-dialog';
import { PaymentForm } from '@/app/components/PaymentForm';

interface CreditRechargeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => Promise<void>;
  credits: number;
}

export default function CreditRechargeDialog({ isOpen, onClose, onSuccess, credits: initialCredits }: CreditRechargeDialogProps) {
  const router = useRouter();
  const [selectedPackage, setSelectedPackage] = useState<string>('standard');
  const [paymentType, setPaymentType] = useState<PaymentType>(PaymentType.ALIPAY);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(initialCredits || 0);
  const [showHistory, setShowHistory] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'checking' | 'success' | 'pending' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [checkCount, setCheckCount] = useState(0);
  
  // 检查URL中是否有订单参数，并处理支付结果轮询
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentStarted, setPaymentStarted] = useState(false);
  
  // 历史订单对话框
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // 保存支付表单数据
  const [paymentFormData, setPaymentFormData] = useState<any>(null);
  
  // 自动检查支付状态的定时器
  const [autoCheckTimer, setAutoCheckTimer] = useState<NodeJS.Timeout | null>(null);
  
  // 更新点数信息
  useEffect(() => {
    setCredits(initialCredits || 0);
  }, [initialCredits]);
  
  // 在组件挂载和更新时，检查URL中是否有订单参数
  useEffect(() => {
    const checkOrderFromUrl = async () => {
      if (typeof window === 'undefined') return;
      
      const urlParams = new URLSearchParams(window.location.search);
      const orderParam = urlParams.get('order_no');
      
      if (orderParam) {
        // 如果URL中有订单参数，更新状态并初始化检查
        setOrderNo(orderParam);
        handleCheckPayment(orderParam);
        
        // 尝试从localStorage中获取之前的套餐ID
        try {
          const storedPackageId = localStorage.getItem(`package_${orderParam}`);
          if (storedPackageId) {
            setSelectedPackage(storedPackageId);
          }
        } catch (err) {
          console.error('读取本地存储套餐ID失败', err);
        }
      }
    };
    
    checkOrderFromUrl();
    
    // 页面刷新或URL变更时重新检查点数状态
    window.addEventListener('popstate', checkOrderFromUrl);
    
    return () => {
      window.removeEventListener('popstate', checkOrderFromUrl);
      // 清除定时器
      if (autoCheckTimer) {
        clearInterval(autoCheckTimer);
      }
    };
  }, []);
  
  // 手动刷新功能
  const handleManualRefresh = async () => {
    if (orderNo) {
      handleCheckPayment(orderNo);
    } else if (onSuccess) {
      await onSuccess();
    }
  };
  
  // 自动检查订单状态
  useEffect(() => {
    // 已经在检查中或成功支付，跳过
    if (isCheckingPayment || paymentSuccess || !orderNo || !paymentStarted) {
      return;
    }
    
    // 清除之前的定时器
    if (autoCheckTimer) {
      clearInterval(autoCheckTimer);
    }
    
    // 设置自动检查，前30秒每5秒检查一次，之后每15秒检查一次
    const checkPaymentStatus = () => {
      const timer = setInterval(() => {
        // 根据检查次数动态调整间隔时间
        if (checkCount > 6) {
          clearInterval(timer);
          // 如果已经检查了6次（30秒）后还未成功，切换到更长的间隔
          const longTimer = setInterval(() => {
            if (!isCheckingPayment && orderNo && paymentStarted && !paymentSuccess) {
              handleCheckPayment(orderNo);
            } else {
              // 成功或用户离开了，清除定时器
              clearInterval(longTimer);
            }
          }, 15000); // 每15秒检查一次
          
          setAutoCheckTimer(longTimer);
        } else {
          // 前30秒，每5秒检查一次
          if (!isCheckingPayment && orderNo && paymentStarted && !paymentSuccess) {
            handleCheckPayment(orderNo);
          }
        }
      }, 5000); // 最初每5秒检查一次
      
      setAutoCheckTimer(timer);
    };
    
    // 立即开始第一次检查
    setTimeout(() => {
      if (orderNo && paymentStarted && !paymentSuccess && !isCheckingPayment) {
        handleCheckPayment(orderNo);
      }
    }, 2000);
    
    // 启动定时检查
    checkPaymentStatus();
    
    return () => {
      if (autoCheckTimer) {
        clearInterval(autoCheckTimer);
      }
    };
  }, [orderNo, paymentStarted, paymentSuccess, isCheckingPayment, checkCount]);
  
  // 检查支付状态
  const handleCheckPayment = async (orderNoToCheck: string) => {
    if (isCheckingPayment) return;
    
    try {
      setIsCheckingPayment(true);
      setCheckCount(prev => prev + 1);
      
      const response = await fetch(`/api/payment/check?order_no=${orderNoToCheck}&_t=${Date.now()}`);
      
      if (!response.ok) {
        throw new Error(`服务器响应错误: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 根据支付状态更新UI
      if (data.success && data.order) {
        // 如果订单支付成功
        if (data.order.status === 'success') {
          setPaymentSuccess(true);
          setPaymentStarted(false);
          setIsCheckingPayment(false);
          setPaymentStatus('success');
          setStatusMessage('支付成功！您的点数已增加');
          
          // 更新本地点数
          if (onSuccess) {
            await onSuccess();
          }
          
          // 清除定时器
          if (autoCheckTimer) {
            clearInterval(autoCheckTimer);
            setAutoCheckTimer(null);
          }
          
          return;
        } else if (data.order.status === 'pending') {
          // 订单待处理
          setPaymentStatus('pending');
          setStatusMessage('支付正在处理中，稍后将自动更新');
        } else {
          // 订单异常状态
          setPaymentStatus('error');
          setStatusMessage(`支付状态: ${data.order.status}`);
        }
      } else {
        // API调用成功但返回错误
        if (data.error) {
          setPaymentStatus('error');
          setStatusMessage(`查询订单失败: ${data.error}`);
        } else {
          setPaymentStatus('error');
          setStatusMessage('无法获取订单状态，请稍后重试');
        }
      }
    } catch (error) {
      // 请求异常
      console.error('检查支付状态出错:', error);
      setPaymentStatus('error');
      setStatusMessage('网络连接错误，请重试');
    } finally {
      setIsCheckingPayment(false);
    }
  };
  
  // 获取订单历史
  const fetchOrderHistory = async () => {
    setLoadingHistory(true);
    
    try {
      const response = await fetch('/api/payment/history');
      if (!response.ok) {
        throw new Error(`服务器错误: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.orders) {
        setOrderHistory(data.orders);
      } else {
        setError('获取订单历史失败');
      }
    } catch (error) {
      console.error('获取订单历史失败:', error);
      setError('网络错误，无法获取订单历史');
    } finally {
      setLoadingHistory(false);
    }
  };
  
  const handleOpenOrderHistory = () => {
    fetchOrderHistory();
    setShowHistory(true);
  };
  
  // 处理支付请求
  const handlePayment = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      
      // 获取选中的套餐
      const packageItem = CREDIT_PACKAGES.find(pkg => pkg.id === selectedPackage);
      
      if (!packageItem) {
        throw new Error('无效的套餐选择');
      }
      
      // 发送支付请求
      const response = await fetch('/api/payment/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: selectedPackage,
          paymentType: paymentType,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`服务器响应错误: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || '创建支付订单失败');
      }
      
      console.log('支付响应:', data);
      
      // 保存订单号到状态
      setOrderNo(data.data.orderNo);
      setPaymentUrl(data.data.paymentUrl);
      
      // 保存套餐ID到本地存储，便于恢复
      try {
        localStorage.setItem(`package_${data.data.orderNo}`, selectedPackage);
      } catch (err) {
        console.warn('存储套餐ID失败', err);
      }
      
      // 保存支付表单数据
      if (data.data.formData) {
        setPaymentFormData({
          url: data.data.paymentUrl,
          formData: data.data.formData
        });
        
        // 设置一个标志，表示支付已开始但未确认完成
        setPaymentStarted(true);
        setIsProcessing(false);
        
        // 显示友好提示，告知用户自动检查
        setError('请在新窗口中完成支付，系统将自动检查支付状态');
        
        return;
      }
      
      // 如果没有表单数据但有URL，则进行重定向
      if (data.data.paymentUrl) {
        window.open(data.data.paymentUrl, '_blank');
        
        // 设置支付已开始
        setPaymentStarted(true);
        setIsProcessing(false);
        
        // 显示友好提示
        setError('请在新窗口中完成支付，支付完成后返回此页面');
      } else {
        throw new Error('无效的支付数据');
      }
    } catch (error) {
      console.error('处理支付时出错:', error);
      setError(error instanceof Error ? error.message : '创建支付订单失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <>
      <Dialog open={isOpen} onOpenChange={(isDialogOpen: boolean) => {
        if (!isDialogOpen) {
          setPaymentType(PaymentType.ALIPAY);
          setIsProcessing(false);
          setError(null);
          setPaymentUrl(null);
          setOrderNo(null);
          setPaymentStatus('idle');
          setStatusMessage(null);
          setCheckCount(0);
        }
        onClose();
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>充值点数</DialogTitle>
            <DialogDescription>
              选择充值套餐，享受更多优惠，赠送最高达31%
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
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                您的点数已充值成功
              </p>
              <Button 
                onClick={onClose} 
                className="mt-2"
                variant="default"
              >
                关闭
              </Button>
            </div>
          )}
          
          {/* 表单支付 */}
          {paymentFormData && paymentStarted && !paymentSuccess && !isCheckingPayment && (
            <div className="py-4">
              <PaymentForm url={paymentFormData.url} formData={paymentFormData.formData} />
              
              <div className="flex flex-col items-center space-y-3 mt-4 p-4 border rounded-md">
                <div className="text-center mb-2">
                  <p className="text-sm font-medium">订单号: {orderNo}</p>
                  <p className="text-xs text-muted-foreground">完成支付后，系统将自动检查状态</p>
                </div>
                <Button
                  onClick={() => setPaymentStarted(false)}
                  className="w-full"
                  variant="outline"
                >
                  返回套餐选择
                </Button>
              </div>
            </div>
          )}
          
          {/* 套餐选择 */}
          {!isCheckingPayment && !paymentSuccess && !paymentStarted && (
            <div className="grid gap-4 py-4">
              {error && (
                <Alert variant={error.includes('请在新窗口') || error.includes('系统将自动') ? "default" : "destructive"}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-medium">选择充值套餐</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center text-xs gap-1 h-7"
                    onClick={handleOpenOrderHistory}
                  >
                    <History className="h-3.5 w-3.5" />
                    查看历史订单
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {CREDIT_PACKAGES.map((pkg) => (
                    <Button
                      key={pkg.id}
                      variant={selectedPackage === pkg.id ? "default" : "outline"}
                      className={`flex flex-col h-auto p-4 relative ${pkg.recommended ? 'border-primary' : ''} ${pkg.bestValue ? 'border-amber-500' : ''}`}
                      onClick={() => setSelectedPackage(pkg.id)}
                    >
                      {pkg.recommended && (
                        <span className="absolute -top-2 -right-2 bg-primary text-white text-xs py-0.5 px-2 rounded-full">⭐推荐⭐</span>
                      )}
                      {pkg.bestValue && (
                        <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs py-0.5 px-2 rounded-full">💎最划算💎</span>
                      )}
                      
                      <div className="flex justify-between w-full items-center">
                        <div className="flex flex-col items-start">
                          <span className="text-base font-medium">{pkg.name}</span>
                          {pkg.tag && <span className="text-xs text-muted-foreground">{pkg.tag}</span>}
                        </div>
                        <span className={`text-xl font-bold ${selectedPackage === pkg.id ? 'text-white' : 'text-primary'}`}>¥{pkg.price}</span>
                      </div>
                      
                      <div className="flex justify-between w-full mt-2 items-center">
                        <div className="flex flex-col items-start">
                          <div className="flex items-center">
                            <span className="text-base">基础点数:</span>
                            <span className="text-base font-medium ml-1">{pkg.baseCredits || pkg.credits}点</span>
                          </div>
                          {pkg.bonusCredits && pkg.bonusCredits > 0 && (
                            <div className="flex items-center text-rose-500">
                              <span className="text-base">赠送点数:</span>
                              <span className="text-base font-medium ml-1">+{pkg.bonusCredits}点</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-lg font-bold">总计{pkg.credits}点</span>
                          {pkg.bonusCredits && pkg.bonusCredits > 0 && (
                            <span className="text-xs text-rose-500">
                              单价约{(pkg.price / pkg.credits).toFixed(2)}元/点
                            </span>
                          )}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  充值越多，赠送越多，单点成本最低低至0.76元！
                </p>
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
            {!isCheckingPayment && !paymentSuccess && !paymentStarted && (
              <>
                <Button variant="outline" onClick={onClose} disabled={isProcessing}>
                  取消
                </Button>
                <Button 
                  onClick={handlePayment} 
                  disabled={isProcessing || !selectedPackage}
                >
                  {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isProcessing ? '处理中...' : '立即充值'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 历史订单对话框 */}
      <OrderHistoryDialog 
        open={showHistory} 
        onOpenChange={(open) => setShowHistory(open)}
        // 历史订单更新成功后，也触发全局刷新
        onOrderUpdated={async () => {
          if (onSuccess) {
            await onSuccess();
          }
        }}
      />
    </>
  );
} 