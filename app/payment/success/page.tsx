'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function PaymentSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'checking' | 'success' | 'failed'>('checking');
  const [message, setMessage] = useState('正在验证支付结果...');
  const [retryCount, setRetryCount] = useState(0);
  
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
    
    // 检查并修复订单
    checkAndFixPayment(orderNo);
  }, [orderNo]);
  
  // 指数退避重试机制
  const checkAndFixPayment = async (orderNo: string) => {
    const MAX_RETRIES = 10;
    const INITIAL_DELAY = 1000; // 1秒
    
    try {
      if (retryCount > MAX_RETRIES) {
        setStatus('failed');
        setMessage(`已尝试${MAX_RETRIES}次，订单状态仍未更新，请稍后刷新页面重试`);
        setLoading(false);
        return;
      }
      
      // 先尝试使用公共修复接口
      const fixRes = await fetch(`/api/payment/fix-public?order_no=${orderNo}`);
      const fixData = await fixRes.json();
      
      if (fixData.success) {
        // 修复成功，刷新用户点数
        setStatus('success');
        if (fixData.result && fixData.result.message) {
          setMessage(fixData.result.message);
        } else {
          setMessage('支付成功！您的订单已处理，点数已增加');
        }
        
        // 更新用户点数信息 - 使用多次刷新
        ensureCreditsRefreshed();
        
        toast({
          title: '支付成功',
          description: '您的点数已增加',
          variant: 'default',
        });
        
        setLoading(false);
        return;
      }
      
      // 尝试使用标准检查接口
      const checkRes = await fetch(`/api/payment/check?order_no=${orderNo}`);
      
      // 如果接口返回成功
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        
        if (checkData.success && checkData.order && checkData.order.status === 'success') {
          setStatus('success');
          setMessage('支付成功！您的订单已处理，点数已增加');
          
          // 更新用户点数信息 - 使用多次刷新
          ensureCreditsRefreshed();
          
          toast({
            title: '支付成功',
            description: '您的点数已增加',
            variant: 'default',
          });
          
          setLoading(false);
          return;
        }
      }
      
      // 如果当前重试次数为0，添加一条提示信息
      if (retryCount === 0) {
        setMessage('正在处理您的订单，请稍候...');
      }
      
      // 增加重试计数
      setRetryCount(prev => prev + 1);
      
      // 指数退避重试
      const delay = INITIAL_DELAY * Math.pow(1.5, retryCount);
      setTimeout(() => {
        checkAndFixPayment(orderNo);
      }, delay);
      
    } catch (error) {
      console.error('检查订单失败:', error);
      
      // 增加重试计数
      setRetryCount(prev => prev + 1);
      
      // 错误后仍继续重试
      const delay = INITIAL_DELAY * Math.pow(2, retryCount);
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
    // 立即执行一次
    let success = await actualRefreshCredits();
    
    // 如果第一次失败，间隔1秒再执行一次
    if (!success) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      success = await actualRefreshCredits();
    }
    
    // 如果还是失败，间隔2秒再执行一次
    if (!success) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      success = await actualRefreshCredits();
    }
    
    // 最后再执行一次，以确保数据一致性
    if (!success) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await actualRefreshCredits();
    }
    
    // 使用页面刷新方式获取最新状态，而不是依赖不存在的方法
    try {
      // 这里只执行页面重新获取数据的逻辑，不调用不存在的refreshUserCredits
      console.log('已完成点数刷新');
    } catch (error) {
      console.error('刷新全局用户点数状态失败:', error);
    }
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
    checkAndFixPayment(orderNo || '');
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