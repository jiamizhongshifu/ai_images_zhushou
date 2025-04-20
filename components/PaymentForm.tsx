import { useState } from 'react';

interface PaymentFormProps {
  amount: number;
  credits: number;
}

export const PaymentForm: React.FC<PaymentFormProps> = ({ amount, credits }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [paymentStarted, setPaymentStarted] = useState(false);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsProcessing(true);
      setError('');
      
      const response = await fetch('/api/payment/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, credits })
      });
  
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
  
      const data = await response.json();
      
      // 打开新窗口进行支付
      const paymentWindow = window.open(data.url, '_blank');
      
      // 仅在新窗口打开时设置提示信息
      if (paymentWindow) {
        setError('请在新打开的窗口中完成支付');
      } else {
        setError('浏览器阻止了支付窗口，请允许弹出窗口后重试');
      }
  
      // 开始轮询支付状态 - 增加延迟
      setTimeout(() => {
        startPollingPaymentStatus(data.orderNo);
      }, 10000); // 延迟10秒启动轮询
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '支付请求失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // 轮询支付状态
  const startPollingPaymentStatus = async (orderNo: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 最多轮询5分钟
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/payment/status/${orderNo}`);
        const data = await response.json();
        
        if (data.status === 'success') {
          setPaymentStarted(true);
          setError('支付成功！正在刷新页面...');
          setTimeout(() => window.location.reload(), 2000);
          return true;
        }
        
        if (data.status === 'failed') {
          setError('支付失败，请重试');
          return true;
        }
        
        return false;
      } catch (err) {
        console.error('检查支付状态出错:', err);
        return false;
      }
    };
    
    const poll = async () => {
      if (attempts >= maxAttempts) {
        setError('支付状态查询超时，如已完成支付请刷新页面');
        return;
      }
      
      attempts++;
      const isDone = await checkStatus();
      
      if (!isDone) {
        setTimeout(poll, 5000); // 每5秒查询一次
      }
    };
    
    poll();
  };

  return (
    <form onSubmit={handlePaymentSubmit}>
      {/* 表单内容 */}
      <button type="submit" disabled={isProcessing}>
        {isProcessing ? '处理中...' : '确认支付'}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}; 