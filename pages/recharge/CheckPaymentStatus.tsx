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
  maxAttempts = 5,
  interval = 3000, // 默认3秒检查一次
  autoStart = true
}) => {
  // 状态
  const [checking, setChecking] = useState<boolean>(false);
  const [attempts, setAttempts] = useState<number>(0);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);
  const [paymentData, setPaymentData] = useState<any>(null);
  
  // 检查支付状态的函数
  const checkStatus = async () => {
    if (!orderNo || success || attempts >= maxAttempts) return;
    
    setChecking(true);
    try {
      const response = await fetch(`/api/payment/check?order_no=${orderNo}`);
      const result = await response.json();
      
      if (result.success) {
        if (result.order?.status === 'success') {
          // 支付成功
          setSuccess(true);
          setPaymentData(result.order);
          onSuccess?.(result.order);
          return;
        }
      }
      
      // 未成功，增加尝试次数
      setAttempts(prev => prev + 1);
      
      // 如果未达到最大尝试次数，继续检查
      if (attempts + 1 < maxAttempts) {
        setTimeout(checkStatus, interval);
      } else {
        // 已达到最大尝试次数
        setError({ message: '支付状态检查超时，请手动刷新页面' });
        onError?.({ message: '支付状态检查超时，请手动刷新页面' });
      }
    } catch (err) {
      console.error('检查支付状态错误:', err);
      setError(err);
      onError?.(err);
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
          {paymentData?.credits && (
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