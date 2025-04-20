import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CreditCard, CheckCircle2, RefreshCw, History, Clock } from "lucide-react";
import { CREDIT_PACKAGES, PaymentType } from '@/utils/payment';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import OrderHistoryDialog from '@/components/payment/order-history-dialog';
import { toast } from 'react-hot-toast';

interface CreditRechargeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => Promise<void>;
  credits: number;
}

// 支付状态显示组件
const PaymentStatusDisplay = ({ status, checkCount }: { status: string; checkCount: number }) => {
  const getStatusMessage = () => {
    switch (status) {
      case 'checking':
        return `正在确认支付状态...（第${checkCount}次检查）`;
      case 'success':
        return '支付成功！';
      case 'error':
        return '支付状态确认出错';
      case 'idle':
        return '等待支付...';
      default:
        return '处理中...';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'checking':
        return 'text-blue-600';
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className={`flex items-center gap-2 ${getStatusColor()}`}>
      {status === 'checking' && (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
      )}
      <span>{getStatusMessage()}</span>
    </div>
  );
};

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
  const maxCheckCount = 30; // 最多检查30次
  const initialCheckDelay = 2000; // 初始检查延迟2秒
  const maxCheckDelay = 5000; // 最大检查延迟5秒
  
  // 检查URL中是否有订单参数，并处理支付结果轮询
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentStarted, setPaymentStarted] = useState(false);
  
  // 历史订单对话框
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // 自动检查支付状态的定时器
  const [autoCheckTimer, setAutoCheckTimer] = useState<NodeJS.Timeout | null>(null);

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
    
    // 组件卸载时清除定时器
    return () => {
      if (autoCheckTimer) {
        clearInterval(autoCheckTimer);
      }
    };
  }, []);
  
  // 轮询检查支付状态
  useEffect(() => {
    if (isCheckingPayment && orderNo) {
      const checkPaymentStatus = async () => {
        if (checkCount >= maxCheckCount) {
          setPaymentStatus('error');
          toast.error('支付状态确认超时，请刷新页面重试或联系客服');
          return;
        }

        try {
          setPaymentStatus('checking');
          
          // 计算当前检查延迟时间（递增）
          const currentDelay = Math.min(initialCheckDelay + checkCount * 500, maxCheckDelay);

          // 调用修复接口
          const fixResponse = await fetch(`/api/payment/fix-public?order_no=${orderNo}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (!fixResponse.ok) {
            // 如果是 404，说明订单还未创建，等待后重试
            if (fixResponse.status === 404) {
              console.log('订单未找到，等待创建...');
              setTimeout(() => {
                setCheckCount(prev => prev + 1);
                checkPaymentStatus();
              }, currentDelay);
              return;
            }

            throw new Error(`修复接口请求失败: ${fixResponse.status}`);
          }

          const fixResult = await fixResponse.json();
          
          // 根据返回结果处理不同状态
          if (fixResult.success) {
            if (fixResult.order?.status === 'success' || fixResult.status === 'success') {
              setPaymentStatus('success');
              toast.success('支付成功！');
              onSuccess?.();
              return;
            }
          }

          // 检查支付状态
          const checkResponse = await fetch(`/api/payment/check?order_no=${orderNo}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (!checkResponse.ok) {
            throw new Error(`状态检查失败: ${checkResponse.status}`);
          }

          const checkResult = await checkResponse.json();

          if (checkResult.success) {
            if (checkResult.order?.status === 'success') {
              setPaymentStatus('success');
              toast.success('支付成功！');
              onSuccess?.();
              return;
            }
          }

          // 如果还未成功，继续检查
          setTimeout(() => {
            setCheckCount(prev => prev + 1);
            checkPaymentStatus();
          }, currentDelay);

        } catch (error) {
          console.error('检查支付状态时出错:', error);
          
          // 如果是网络错误，尝试重试
          if (error instanceof Error && error.message.includes('fetch')) {
            setTimeout(() => {
              setCheckCount(prev => prev + 1);
              checkPaymentStatus();
            }, maxCheckDelay);
            return;
          }

          setPaymentStatus('error');
          toast.error('检查支付状态时出错，请刷新页面重试');
        }
      };
      
      // 开始检查
      checkPaymentStatus();
    }
  }, [isCheckingPayment, orderNo]);
  
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
  const pollOrderStatus = async (orderNo: string, maxRetries = 10) => {
    console.log(`开始轮询订单 ${orderNo} 状态`);
    let retries = 0;
    
    // 轮询函数
    const checkStatus = async (): Promise<boolean> => {
      try {
        // 不再直接使用 fix-public 接口，而是先调用 check 接口检查订单状态
        const checkRes = await fetch(`/api/payment/check?order_no=${orderNo}`);
        
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          
          // 只有当订单状态确认为 success 时才返回成功
          if (checkData.success && checkData.order?.status === 'success') {
            console.log(`订单 ${orderNo} 状态为成功`);
            return true;
          }
          
          // 如果订单状态仍为 pending，则调用 fix-public 尝试一次修复
          // 但不依赖修复接口的返回值判断支付成功
          if (checkData.success && checkData.order?.status === 'pending') {
            console.log(`订单 ${orderNo} 状态为待支付，尝试修复`);
            try {
              await fetch(`/api/payment/fix-public?order_no=${orderNo}`);
            } catch (e) {
              // 忽略修复接口的错误
              console.warn(`修复接口调用失败，继续轮询`, e);
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
        
        // 延迟后再次检查，时间间隔递增
        const delay = Math.min(2000 + retries * 1000, 10000); // 从2秒开始，最多10秒
        await new Promise(resolve => setTimeout(resolve, delay));
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
  const ensureCreditsRefreshed = async (): Promise<number | null> => {
    try {
      // 多次尝试刷新点数
      for (let i = 0; i < 3; i++) {
        // 使用await来等待fetchCredits完成
        const response = await fetch(`/api/credits/get?_t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store',
            'Pragma': 'no-cache'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && typeof data.credits === 'number') {
            console.log(`点数刷新成功: ${data.credits}点`);
            return data.credits;
          }
        }
        
        // 等待一段时间后再次尝试
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.warn('多次尝试刷新点数未成功');
      return null;
    } catch (error) {
      console.error('刷新点数过程中出错:', error);
      return null;
    }
  };
  
  // 改进处理支付结果
  const handlePaymentComplete = async () => {
    if (!orderNo) return;
    
    setPaymentStatus('checking');
    setStatusMessage('正在检查支付状态，请稍候...');
    
    try {
      // 开始轮询检查支付状态
      const response = await fetch(`/api/payment/check?orderNo=${orderNo}`);
      const data = await response.json();
      
      if (response.ok) {
        if (data.success) {
          // 支付成功
          const creditsAdded = CREDIT_PACKAGES.find(pkg => pkg.id === data.order.packageId)?.credits || 0;
          const newCredits = (initialCredits || 0) + creditsAdded;
          
          setPaymentStatus('success');
          setStatusMessage(`支付成功！已增加 ${creditsAdded} 点数，当前余额: ${newCredits} 点数`);
          setCredits(newCredits);
          
          if (onSuccess) {
            await onSuccess();
          }
          
          // 刷新路由，但不关闭对话框
          router.refresh();
          return true;
        }
        // 处理其他状态...
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
      setPaymentStatus('error');
      setStatusMessage('检查支付状态时出错，请稍后重试');
    }
  };
  
  // 改进支付按钮点击处理
  const handlePayment = async () => {
    if (!selectedPackage) {
      setError('请选择充值套餐');
      return;
    }
    
    setError('');
    setIsProcessing(true);
    
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
        setOrderNo(orderNo);
        
        // 打开支付页面
        if (data.data.paymentUrl) {
          // 创建一个新窗口打开支付链接
          const paymentWindow = window.open(data.data.paymentUrl, '_blank');
          
          // 如果支付窗口成功打开，设置自动轮询检查支付状态
          if (paymentWindow) {
            // 设置一个标志，表示支付已开始但未确认完成
            setPaymentStarted(true);
            setIsProcessing(false);
            
            // 显示友好提示，告知用户自动检查
            setError('请在新窗口中完成支付，系统将自动检查支付状态');
            
            // 5秒后开始自动检查支付状态
            setTimeout(() => {
              // 启动自动轮询检查支付状态
              const timer = setInterval(async () => {
                console.log(`自动检查订单 ${orderNo} 支付状态...`);
                
                try {
                  // 检查支付状态
                  const checkRes = await fetch(`/api/payment/check?order_no=${orderNo}`);
                  if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    
                    // 如果支付成功，停止轮询并更新UI
                    if (checkData.success && checkData.order?.status === 'success') {
                      console.log(`订单 ${orderNo} 自动检查发现支付成功`);
                      
                      // 清除定时器
                      clearInterval(timer);
                      setAutoCheckTimer(null);
                      
                      // 处理支付成功
                      setPaymentSuccess(true);
                      
                      // 通知上层组件支付成功，让 UserStateProvider 刷新
                      if (onSuccess) {
                        await onSuccess();
                      }
                      
                      // 延迟关闭对话框
                      setTimeout(() => {
                        // 刷新页面获取最新点数 - 可以考虑移除，依赖 onSuccess 的刷新
                        // router.refresh(); 
                        onClose(); // 直接关闭对话框
                      }, 2000);
                      
                      return;
                    }
                    
                    // 尝试修复订单
                    if (checkData.success && checkData.order?.status === 'pending') {
                      // 尝试修复订单
                      await fetch(`/api/payment/fix-public?order_no=${orderNo}`);
                    }
                  }
                } catch (error) {
                  console.error('自动检查支付状态出错:', error);
                }
              }, 5000); // 每5秒检查一次
              
              // 保存定时器ID，以便可以在组件卸载时清除
              setAutoCheckTimer(timer);
              
              // 设置30分钟超时，防止无限轮询
              setTimeout(() => {
                if (autoCheckTimer) {
                  clearInterval(autoCheckTimer);
                  setAutoCheckTimer(null);
                  setError('支付状态检查超时，如已完成支付，请点击"检查支付状态"按钮');
                }
              }, 30 * 60 * 1000);
            }, 5000);
          } else {
            // 如果窗口被拦截，提示用户
            setIsProcessing(false);
            setError('支付窗口被拦截，请允许弹出窗口或直接访问支付链接');
            console.log('支付链接:', data.data.paymentUrl);
          }
        } else {
          setIsProcessing(false);
          setError('未获取到支付链接');
        }
      } else {
        setIsProcessing(false);
        setError(data.error || '创建支付订单失败');
      }
    } catch (error) {
      setIsProcessing(false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('支付过程发生错误:', errorMessage);
      setError(`支付过程出错: ${errorMessage}`);
    }
  };
  
  // 添加手动检查支付状态按钮的处理函数
  const handleCheckPayment = async () => {
    if (!orderNo) {
      setError('没有待处理的订单');
      return;
    }
    
    setIsCheckingPayment(true);
    setError('正在检查支付状态，请稍候...');
    
    try {
      const success = await pollOrderStatus(orderNo);
      
      if (success) {
        // 支付成功
        setPaymentSuccess(true);
        
        // 通知上层组件支付成功，让 UserStateProvider 刷新
        if (onSuccess) {
          await onSuccess();
        }
        
        // 获取最新的积分（可选，主要为了显示消息）
        const newCredits = await ensureCreditsRefreshed(); 
        
        // 获取充值前点数
        const packageInfo = CREDIT_PACKAGES.find(p => p.id === selectedPackage);
        const creditsAdded = packageInfo?.credits || 0;
        const previousCredits = newCredits !== null ? newCredits - creditsAdded : initialCredits;
        
        // 显示成功消息
        setError(`充值成功！${newCredits !== null ? `当前点数: ${newCredits}` : ''}`);
        
        // 延迟关闭对话框
        setTimeout(() => {
          onClose();
        }, 2000);
        
      } else {
        // 支付未完成
        setIsCheckingPayment(false);
        setError('订单支付未完成或状态未知，请确认您已完成支付后再次点击"检查支付状态"');
      }
    } catch (error) {
      setIsCheckingPayment(false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('检查支付状态失败:', errorMessage);
      setError(`检查支付失败: ${errorMessage}`);
    } finally {
      // 手动检查完成后，重置 isCheckingPayment 状态
      setIsCheckingPayment(false);
    }
  };
  
  // 加载历史订单
  const fetchOrderHistory = async () => {
    setLoadingHistory(true);
    
    try {
      const response = await fetch('/api/payment/history');
      if (!response.ok) {
        throw new Error(`获取历史订单失败: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setOrderHistory(data.orders || []);
      } else {
        throw new Error(data.error || '获取历史订单失败');
      }
    } catch (error) {
      console.error('加载历史订单出错:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`加载历史订单失败: ${errorMessage}`);
    } finally {
      setLoadingHistory(false);
    }
  };
  
  // 打开历史订单弹窗
  const handleOpenOrderHistory = () => {
    fetchOrderHistory();
    setShowHistory(true);
  };
  
  // 重置状态
  const resetStatus = () => {
    setPaymentStatus('idle');
    setCheckCount(0);
  };

  useEffect(() => {
    if (orderNo) {
      resetStatus();
    }
  }, [orderNo]);

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
          
          {/* 添加支付状态显示 */}
          {paymentStatus !== 'idle' && (
            <div className="mb-4">
              <PaymentStatusDisplay status={paymentStatus} checkCount={checkCount} />
            </div>
          )}
          
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
          
          {/* 套餐选择 */}
          {!isCheckingPayment && !paymentSuccess && (
            <div className="grid gap-4 py-4">
              {error && (
                <Alert variant={error.includes('请在新窗口') || error.includes('系统将自动') ? "default" : "destructive"}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              {/* 支付已开始但未确认 */}
              {paymentStarted && orderNo && !paymentSuccess && (
                <div className="flex flex-col items-center space-y-3 p-4 border rounded-md">
                  <div className="text-center mb-2">
                    <p className="text-sm font-medium">订单号: {orderNo}</p>
                    <p className="text-xs text-muted-foreground">系统正在自动检查支付状态，您也可以手动点击按钮检查</p>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 mb-1">
                    <div 
                      className="bg-primary h-2 rounded-full animate-pulse" 
                      style={{ width: isCheckingPayment ? '100%' : '0%' }}
                    ></div>
                  </div>
                  <Button 
                    onClick={handleCheckPayment} 
                    className="w-full"
                    variant="default"
                  >
                    {isCheckingPayment ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在检查支付状态...
                      </>
                    ) : '检查支付状态'}
                  </Button>
                  <Button
                    onClick={() => setPaymentStarted(false)}
                    className="w-full"
                    variant="outline"
                  >
                    返回套餐选择
                  </Button>
                </div>
              )}
              
              {/* 套餐选择区域 */}
              {!paymentStarted && (
                <>
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
                </>
              )}
            </div>
          )}
          
          <DialogFooter>
            {!isCheckingPayment && !paymentSuccess && (
              <>
                <Button variant="outline" onClick={onClose} disabled={isProcessing}>
                  取消
                </Button>
                {!paymentStarted ? (
                  <Button 
                    onClick={handlePayment} 
                    disabled={isProcessing || !selectedPackage}
                  >
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isProcessing ? '处理中...' : '立即充值'}
                  </Button>
                ) : (
                  <Button 
                    onClick={handleCheckPayment} 
                    disabled={isProcessing || !orderNo}
                  >
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    检查支付状态
                  </Button>
                )}
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