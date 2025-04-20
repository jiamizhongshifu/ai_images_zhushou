import React, { useEffect, useState } from 'react';

interface CheckPaymentStatusProps {
  orderNo: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  maxAttempts?: number;
  interval?: number;
  autoStart?: boolean;
}

/**
 * 支付状态检查组件
 * 用于前端自动轮询检查支付状态，直到支付成功或达到最大检查次数
 */
const CheckPaymentStatus: React.FC<CheckPaymentStatusProps> = ({
  orderNo,
  onSuccess,
  onError,
  maxAttempts = 15, // 增加最大尝试次数，从5次增加到15次
  interval = 2000, // 更频繁地检查，从3秒改为2秒
  autoStart = true
}) => {
  // 状态
  const [checking, setChecking] = useState<boolean>(false);
  const [attempts, setAttempts] = useState<number>(0);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);
  const [paymentData, setPaymentData] = useState<any>(null);
  
  // 刷新用户点数函数
  const refreshUserCredits = async () => {
    try {
      // 连续调用3次刷新API，确保点数更新成功
      for (let i = 0; i < 3; i++) {
        await fetch('/api/user/credits', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store', // 禁用缓存，确保获取最新数据
        });
        // 相邻请求间等待300ms
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      console.log('用户点数已刷新');
    } catch (err) {
      console.error('刷新用户点数失败:', err);
    }
  };
  
  // 检查支付状态的函数 - 优先使用公共修复接口，其次使用检查接口
  const checkStatus = async () => {
    if (!orderNo || success || attempts >= maxAttempts) return;
    
    setChecking(true);
    try {
      // 先尝试使用公共修复接口，它有更完善的逻辑处理
      const fixResponse = await fetch(`/api/payment/fix-public?order_no=${orderNo}`);
      const fixResult = await fixResponse.json();
      
      // 如果修复接口返回成功并且处理了支付
      if (fixResult.success && 
          fixResult.result && 
          (fixResult.result.addCredits || 
           fixResult.result.message?.includes('已修复') ||
           fixResult.result.message?.includes('已处理'))) {
        // 支付成功
        setSuccess(true);
        setPaymentData(fixResult.result);
        
        // 刷新用户点数
        await refreshUserCredits();
        
        // 通知父组件
        onSuccess?.(fixResult.result);
        return;
      }
      
      // 如果修复接口未成功处理，回退到标准检查接口
      const response = await fetch(`/api/payment/check?order_no=${orderNo}`);
      const result = await response.json();
      
      if (result.success && result.order?.status === 'success') {
        // 支付成功
        setSuccess(true);
        setPaymentData(result.order);
        
        // 刷新用户点数
        await refreshUserCredits();
        
        // 通知父组件
        onSuccess?.(result.order);
        return;
      }
      
      // 未成功，增加尝试次数
      setAttempts(prev => prev + 1);
      
      // 如果未达到最大尝试次数，继续检查
      if (attempts + 1 < maxAttempts) {
        // 添加指数退避算法，随着尝试次数增加，延迟也会增加
        // 基础延迟使用传入的interval参数，但最大不超过5秒
        const backoffDelay = Math.min(interval * Math.pow(1.2, attempts), 5000);
        setTimeout(checkStatus, backoffDelay);
      } else {
        // 已达到最大尝试次数
        setError({ message: '支付状态检查超时，请手动刷新页面或点击检查按钮' });
        onError?.({ message: '支付状态检查超时，请手动刷新页面或点击检查按钮' });
      }
    } catch (err) {
      console.error('检查支付状态错误:', err);
      setError(err);
      onError?.(err);
      
      // 即使出错也继续尝试，直到达到最大尝试次数
      if (attempts + 1 < maxAttempts) {
        setAttempts(prev => prev + 1);
        setTimeout(checkStatus, interval * 2); // 出错后等待更长时间
      }
    } finally {
      setChecking(false);
    }
  };
  
  // 手动触发检查
  const manualCheck = () => {
    if (checking) return;
    
    // 重置状态
    setError(null);
    setAttempts(0);
    checkStatus();
  };
  
  // 组件挂载后自动开始检查
  useEffect(() => {
    if (autoStart && orderNo) {
      checkStatus();
    }
    
    // 清理函数
    return () => {
      // 这里可以添加清除定时器等操作
    };
  }, [orderNo, autoStart]);
  
  return (
    <div className="payment-status-checker">
      {checking && (
        <div className="checking-status">
          <p>正在检查支付状态... ({attempts}/{maxAttempts})</p>
          <div className="spinner"></div>
        </div>
      )}
      
      {success && (
        <div className="success-status">
          <p className="success-text">支付成功!</p>
          {paymentData?.addCredits && (
            <p>已充值 {paymentData.addCredits} 点</p>
          )}
          {paymentData?.credits && !paymentData?.addCredits && (
            <p>已充值 {paymentData.credits} 点</p>
          )}
        </div>
      )}
      
      {error && (
        <div className="error-status">
          <p className="error-text">{error.message || '检查支付状态时出错'}</p>
          <button 
            className="retry-button"
            onClick={manualCheck}
            disabled={checking}
          >
            重新检查
          </button>
        </div>
      )}
      
      {!checking && !success && attempts >= maxAttempts && (
        <div className="timeout-status">
          <p>支付可能还在处理中，请点击下方按钮查询最新状态</p>
          <button 
            className="refresh-button"
            onClick={manualCheck}
            disabled={checking}
          >
            刷新支付状态
          </button>
        </div>
      )}
      
      <style jsx>{`
        .payment-status-checker {
          margin: 20px 0;
          padding: 15px;
          border-radius: 8px;
          background-color: #f5f5f5;
        }
        
        .checking-status {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
        }
        
        .spinner {
          width: 30px;
          height: 30px;
          border: 3px solid rgba(0, 0, 0, 0.1);
          border-radius: 50%;
          border-top-color: #3498db;
          animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .success-status {
          color: #2ecc71;
          text-align: center;
        }
        
        .success-text {
          font-weight: bold;
          font-size: 18px;
        }
        
        .error-status {
          color: #e74c3c;
          text-align: center;
        }
        
        .error-text {
          margin-bottom: 10px;
        }
        
        .retry-button, .refresh-button {
          background-color: #3498db;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        
        .retry-button:hover, .refresh-button:hover {
          background-color: #2980b9;
        }
        
        .retry-button:disabled, .refresh-button:disabled {
          background-color: #95a5a6;
          cursor: not-allowed;
        }
        
        .timeout-status {
          text-align: center;
          color: #f39c12;
        }
      `}</style>
    </div>
  );
};

export default CheckPaymentStatus; 