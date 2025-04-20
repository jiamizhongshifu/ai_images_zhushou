import React, { useEffect, useState, useCallback } from 'react';

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
  maxAttempts = 12, // 减少最大尝试次数，避免触发限流
  interval = 3000, // 增加基础间隔到3秒
  autoStart = true
}) => {
  // 状态
  const [checking, setChecking] = useState<boolean>(false);
  const [attempts, setAttempts] = useState<number>(0);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [lastRequestTime, setLastRequestTime] = useState<number>(0);
  
  // 限流状态
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);
  const [rateLimitReleaseTime, setRateLimitReleaseTime] = useState<number>(0);
  
  // 刷新用户点数函数 - 添加防抖
  const refreshUserCredits = useCallback(async () => {
    try {
      console.log('开始刷新用户点数...');
      // 连续调用3次刷新API，确保点数更新成功，但添加间隔
      for (let i = 0; i < 3; i++) {
        await fetch('/api/user/credits', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store', // 禁用缓存，确保获取最新数据
        });
        // 相邻请求间等待500ms，降低并发
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      console.log('用户点数已刷新完成');
    } catch (err) {
      console.error('刷新用户点数失败:', err);
    }
  }, []);
  
  // 使用标准检查接口 - 单独提取为函数
  const checkWithStandardApi = useCallback(async () => {
    console.log(`使用标准检查接口查询订单 ${orderNo}`);
    const response = await fetch(`/api/payment/check?order_no=${orderNo}`);
    if (!response.ok) {
      throw new Error(`标准检查接口返回错误: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('支付检查返回结果:', result);
    
    if (result.success && result.order?.status === 'success') {
      return { success: true, data: result.order };
    }
    
    return { success: false };
  }, [orderNo]);
  
  // 使用修复接口 - 单独提取为函数
  const checkWithFixApi = useCallback(async () => {
    console.log(`使用修复接口查询订单 ${orderNo}`);
    const fixResponse = await fetch(`/api/payment/fix-public?order_no=${orderNo}`);
    if (!fixResponse.ok) {
      if (fixResponse.status === 429) {
        // 检测到限流，标记状态并设置恢复时间
        setIsRateLimited(true);
        // 假设限流解除需要30秒
        setRateLimitReleaseTime(Date.now() + 30000);
        throw new Error('修复接口请求过于频繁，已被限流');
      }
      throw new Error(`修复接口返回错误: ${fixResponse.status}`);
    }
    
    const fixResult = await fixResponse.json();
    console.log('支付状态修复结果:', fixResult);
    
    if (fixResult.success && 
        fixResult.result && 
        (fixResult.result.addCredits || 
         fixResult.result.message?.includes('已修复') ||
         fixResult.result.message?.includes('已处理'))) {
      return { success: true, data: fixResult.result };
    }
    
    // 如果包含"订单验证中"或"待支付"，表示订单还在处理中
    if (fixResult.success && 
        fixResult.result?.message?.includes('订单验证中') ||
        fixResult.result?.status === 'pending') {
      console.log('订单', orderNo, '状态为待支付，尝试修复');
    }
    
    return { success: false };
  }, [orderNo]);
  
  // 检查支付状态的函数 - 优先使用公共修复接口，其次使用检查接口
  const checkStatus = useCallback(async () => {
    if (!orderNo || success || attempts >= maxAttempts) return;
    
    // 检查是否处于限流状态
    if (isRateLimited && Date.now() < rateLimitReleaseTime) {
      console.log(`API限流中，等待解除。剩余时间: ${Math.ceil((rateLimitReleaseTime - Date.now())/1000)}秒`);
      // 使用标准接口作为备选
      try {
        const standardResult = await checkWithStandardApi();
        if (standardResult.success) {
          setSuccess(true);
          setPaymentData(standardResult.data);
          await refreshUserCredits();
          onSuccess?.(standardResult.data);
          return;
        }
      } catch (err) {
        console.warn('使用标准接口作为备选时发生错误:', err);
      }
      
      // 继续等待限流解除
      setAttempts(prev => prev + 1);
      return;
    }
    
    // 重置限流状态
    if (isRateLimited && Date.now() >= rateLimitReleaseTime) {
      setIsRateLimited(false);
    }
    
    // 确保请求间隔足够大
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < interval) {
      const waitTime = interval - timeSinceLastRequest;
      console.log(`距离上次请求时间不足${interval}ms，等待${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    setChecking(true);
    setLastRequestTime(Date.now());
    
    try {
      console.log(`自动检查订单 ${orderNo} 支付状态...`);
      
      // 先尝试使用公共修复接口
      try {
        const fixResult = await checkWithFixApi();
        if (fixResult.success) {
          setSuccess(true);
          setPaymentData(fixResult.data);
          await refreshUserCredits();
          onSuccess?.(fixResult.data);
          return;
        }
      } catch (fixError: any) {
        // 如果修复接口失败但不是限流，尝试标准接口
        if (fixError.message?.includes('限流')) {
          console.warn('修复接口已被限流，下次将使用标准接口');
        } else {
          console.error('修复接口错误，尝试标准接口:', fixError);
          
          try {
            const standardResult = await checkWithStandardApi();
            if (standardResult.success) {
              setSuccess(true);
              setPaymentData(standardResult.data);
              await refreshUserCredits();
              onSuccess?.(standardResult.data);
              return;
            }
          } catch (stdError) {
            console.error('标准接口也失败:', stdError);
          }
        }
      }
      
      // 未成功，增加尝试次数
      setAttempts(prev => prev + 1);
      
      // 如果未达到最大尝试次数，继续检查
      if (attempts + 1 < maxAttempts) {
        // 指数退避算法，但底数降低到1.1，减缓增长速度
        const backoffDelay = Math.min(interval * Math.pow(1.1, attempts), 10000);
        console.log(`将在 ${Math.round(backoffDelay/1000)} 秒后再次检查...`);
        setTimeout(checkStatus, backoffDelay);
      } else {
        console.log(`已达到最大尝试次数 ${maxAttempts}，停止自动检查`);
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
        // 出错后等待更长时间，至少5秒
        setTimeout(checkStatus, Math.max(interval * 2, 5000));
      }
    } finally {
      setChecking(false);
    }
  }, [
    orderNo, success, attempts, maxAttempts, interval, isRateLimited, 
    rateLimitReleaseTime, lastRequestTime, onSuccess, onError, 
    refreshUserCredits, checkWithFixApi, checkWithStandardApi
  ]);
  
  // 手动触发检查
  const manualCheck = useCallback(() => {
    if (checking) return;
    
    // 重置状态
    setError(null);
    setAttempts(0);
    setIsRateLimited(false); // 手动检查时重置限流状态
    checkStatus();
  }, [checking, checkStatus]);
  
  // 组件挂载后自动开始检查
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    
    // 启动检查的函数
    const startChecking = () => {
      console.log(`开始轮询订单 ${orderNo} 状态`);
      checkStatus();
    };
    
    if (autoStart && orderNo) {
      // 延迟1秒启动，避免页面加载时的资源竞争
      timeoutId = setTimeout(startChecking, 1000);
    }
    
    // 清理函数
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [orderNo, autoStart, checkStatus]);
  
  return (
    <div className="payment-status-checker">
      {checking && (
        <div className="checking-status">
          <p>正在检查支付状态... ({attempts}/{maxAttempts})</p>
          <div className="spinner"></div>
        </div>
      )}
      
      {isRateLimited && !success && (
        <div className="rate-limited-status">
          <p>检查频率过高，系统正在限流...</p>
          <p className="text-xs">将在 {Math.ceil((rateLimitReleaseTime - Date.now())/1000)} 秒后恢复</p>
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
        
        .rate-limited-status {
          color: #e67e22;
          text-align: center;
          margin: 10px 0;
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