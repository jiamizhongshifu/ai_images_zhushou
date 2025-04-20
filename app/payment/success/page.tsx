'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// 封装使用useSearchParams的组件
function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'checking' | 'success' | 'failed'>('checking');
  const [message, setMessage] = useState('正在验证支付结果...');
  const [retryCount, setRetryCount] = useState(0);
  
  // 使用ref来存储订单信息，避免依赖localStorage
  const orderInfoRef = useRef<{
    orderNo: string | null;
    timestamp: number;
    tradeStatus: string | null;
  }>({
    orderNo: null,
    timestamp: 0,
    tradeStatus: null
  });
  
  // 获取URL中的参数，添加空值检查
  const orderNo = searchParams?.get('out_trade_no') || 
                 searchParams?.get('order_no') || 
                 searchParams?.get('orderNo');
                 
  const tradeStatus = searchParams?.get('trade_status') || 
                     searchParams?.get('trade_state') || 
                     searchParams?.get('status');
  
  // 自动检查并修复订单
  useEffect(() => {
    if (!orderNo) {
      setStatus('failed');
      setMessage('缺少订单号，无法验证支付结果');
      setLoading(false);
      return;
    }
    
    // 保存订单信息到ref，不依赖localStorage
    orderInfoRef.current = {
      orderNo,
      timestamp: Date.now(),
      tradeStatus: tradeStatus || null
    };
    
    // 仍然尝试保存到localStorage作为备选，但使用try-catch避免出错
    try {
      localStorage.setItem('lastPaymentOrderNo', orderNo);
      localStorage.setItem('lastPaymentTimestamp', Date.now().toString());
      if (tradeStatus) {
        localStorage.setItem('lastPaymentTradeStatus', tradeStatus);
      }
      console.log(`支付回调信息已保存，订单号: ${orderNo}`);
    } catch (e) {
      console.warn('无法保存支付状态到localStorage，将使用内存存储', e);
    }
    
    // 检查并修复订单
    checkAndFixPayment(orderNo);
  }, [orderNo]);
  
  // 指数退避重试机制
  const checkAndFixPayment = async (orderNo: string) => {
    const MAX_RETRIES = 20; // 增加到20次，最高可重试约5分钟
    const INITIAL_DELAY = 1000; // 1秒
    const MAX_DELAY = 20000; // 最长20秒
    
    try {
      if (retryCount > MAX_RETRIES) {
        setStatus('failed');
        setMessage(`已尝试${MAX_RETRIES}次，订单状态仍未更新，请点击"重试"按钮继续检查`);
        
        // 即使超出最大重试次数，仍然再发起一次请求尝试修复，不等待结果
        try {
          // 同时调用多个接口，增加成功率
          Promise.allSettled([
            fetch(`/api/payment/fix-public?order_no=${orderNo}&admin_key=${process.env.NEXT_PUBLIC_ADMIN_KEY || ''}`),
            fetch(`/api/payment/check?order_no=${orderNo}`)
          ]);
          console.log('已在后台发送最后尝试修复请求');
        } catch (e) {
          console.warn('后台尝试修复失败', e);
        }
        
        setLoading(false);
        return;
      }
      
      // 先使用多个API并行尝试修复，不管顺序
      const promises = [
        // 公共修复接口 - 添加admin_key跳过限流机制
        fetch(`/api/payment/fix-public?order_no=${orderNo}&admin_key=${process.env.NEXT_PUBLIC_ADMIN_KEY || ''}&attempt=${retryCount}`),
        // 标准检查接口
        fetch(`/api/payment/check?order_no=${orderNo}&attempt=${retryCount}`)
      ];
      
      // 等待最先完成的请求
      const responses = await Promise.allSettled(promises);
      let successData = null;
      
      // 处理所有响应
      for (const resp of responses) {
        if (resp.status === 'fulfilled' && resp.value.ok) {
          try {
            const data = await resp.value.json();
            
            // 检查是否有成功的响应
            if (data.success && 
                ((data.result && data.result.message && 
                  (data.result.message.includes('已修复') || 
                   data.result.message.includes('已处理') ||
                   data.result.message.includes('点数已增加'))) ||
                 (data.order && data.order.status === 'success'))) {
              
              successData = data;
              break;
            }
          } catch (parseError) {
            console.error('解析响应数据失败:', parseError);
          }
        }
      }
      
      // 处理成功响应
      if (successData) {
        // 支付成功，更新UI状态
        setStatus('success');
        setMessage('支付成功！您的订单已处理，点数已增加');
        
        // 清除localStorage中的临时数据
        try {
          localStorage.removeItem('lastPaymentOrderNo');
          localStorage.removeItem('lastPaymentTimestamp');
          localStorage.removeItem('lastPaymentTradeStatus');
        } catch (e) {
          console.warn('清除localStorage失败，但这不影响功能', e);
        }
        
        // 强制刷新用户点数 - 多次尝试确保成功
        await ensureCreditsRefreshed();
        
        toast({
          title: '支付成功',
          description: '您的点数已增加',
          type: 'success',
        });
        
        setLoading(false);
        return;
      }
      
      // 如果当前重试次数为0，添加一条提示信息
      if (retryCount === 0) {
        setMessage('正在处理您的订单，请稍候...');
      }
      
      // 增加重试计数
      setRetryCount(prev => prev + 1);
      
      // 使用指数退避，但限制最大延迟时间
      const baseDelay = Math.min(INITIAL_DELAY * Math.pow(1.3, retryCount), MAX_DELAY);
      // 添加随机抖动以避免同时请求
      const jitter = Math.random() * 500;
      const delay = baseDelay + jitter;
      
      console.log(`将在 ${Math.round(delay/1000)} 秒后进行第 ${retryCount + 1} 次重试`);
      
      setTimeout(() => {
        checkAndFixPayment(orderNo);
      }, delay);
      
    } catch (error) {
      console.error('检查订单失败:', error);
      
      // 增加重试计数
      setRetryCount(prev => prev + 1);
      
      // 错误后稍微等待更长时间
      const delay = Math.min(INITIAL_DELAY * Math.pow(1.5, retryCount), MAX_DELAY * 1.5);
      setTimeout(() => {
        checkAndFixPayment(orderNo);
      }, delay);
    }
  };
  
  // 确保实际获取用户最新点数
  const actualRefreshCredits = async () => {
    try {
      // 向服务器请求最新点数
      const response = await fetch('/api/user/credits', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store', // 禁用缓存，始终获取最新数据
      });
      
      if (response.ok) {
        // 成功获取新的点数数据
        const data = await response.json();
        if (data && data.success && data.credits !== undefined) {
          console.log('成功刷新用户点数，当前余额:', data.credits);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('刷新点数时发生错误:', error);
      return false;
    }
  };
  
  // 添加在重复刷新点数的函数
  const ensureCreditsRefreshed = async () => {
    const MAX_ATTEMPTS = 5; // 最多尝试5次
    const DELAY_BETWEEN_ATTEMPTS = 800; // 每次尝试间隔800ms
    
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        console.log(`第 ${i+1} 次尝试刷新点数...`);
        const success = await actualRefreshCredits();
        
        if (success) {
          console.log(`点数刷新成功 (尝试 ${i+1}/${MAX_ATTEMPTS})`);
          return true;
        }
        
        // 如果不是最后一次尝试，等待一段时间
        if (i < MAX_ATTEMPTS - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ATTEMPTS));
        }
      } catch (e) {
        console.warn(`第 ${i+1} 次刷新点数失败`, e);
      }
    }
    
    console.log('已达到最大尝试次数，点数刷新可能未完全成功');
    return false;
  };
  
  // 返回首页
  const handleBackHome = () => {
    router.push('/');
  };
  
  // 手动重试
  const handleManualRetry = () => {
    setLoading(true);
    setStatus('checking');
    setMessage('正在重新验证支付结果...');
    setRetryCount(0);
    
    // 使用ref中存储的订单号，更可靠
    const currentOrderNo = orderInfoRef.current.orderNo || orderNo || '';
    
    // 如果没有订单号，尝试从localStorage恢复
    if (!currentOrderNo) {
      try {
        const savedOrderNo = localStorage.getItem('lastPaymentOrderNo');
        if (savedOrderNo) {
          checkAndFixPayment(savedOrderNo);
          return;
        }
      } catch (e) {
        console.warn('从localStorage恢复订单号失败', e);
      }
      
      // 如果仍然没有订单号，显示错误
      setStatus('failed');
      setMessage('无法找到订单号，请返回充值页面重试');
      setLoading(false);
      return;
    }
    
    checkAndFixPayment(currentOrderNo);
  };
  
  return (
    <div className="flex justify-center items-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">支付结果</CardTitle>
          <CardDescription>
            {orderNo ? `订单号: ${orderNo}` : '未检测到订单号'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 py-6">
          {loading ? (
            <Loader2 className="h-16 w-16 text-primary animate-spin" />
          ) : status === 'success' ? (
            <CheckCircle className="h-16 w-16 text-green-500" />
          ) : (
            <AlertCircle className="h-16 w-16 text-amber-500" />
          )}
          
          <p className="text-center text-lg mt-4">{message}</p>
          
          {loading && retryCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {`第${retryCount}次重试中，请耐心等待...`}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-center gap-4">
          {status === 'failed' && (
            <Button onClick={handleManualRetry} variant="outline">
              重试
            </Button>
          )}
          <Button onClick={handleBackHome}>
            {status === 'success' ? '返回首页' : '稍后再试'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// 加载状态显示组件
function PaymentLoadingFallback() {
  return (
    <div className="flex justify-center items-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">支付结果</CardTitle>
          <CardDescription>
            正在加载支付信息...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 py-6">
          <Loader2 className="h-16 w-16 text-primary animate-spin" />
          <p className="text-center text-lg mt-4">正在获取支付参数...</p>
        </CardContent>
      </Card>
    </div>
  );
}

// 主导出组件 - 使用Suspense包装SearchParams组件
export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<PaymentLoadingFallback />}>
      <PaymentContent />
    </Suspense>
  );
} 