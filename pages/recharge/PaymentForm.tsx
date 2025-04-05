import React, { useState, useEffect } from 'react';
import CheckPaymentStatus from './CheckPaymentStatus';

interface PaymentFormProps {
  onSuccess?: (order: any) => void;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ onSuccess }) => {
  // 状态管理
  const [amount, setAmount] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [orderNo, setOrderNo] = useState<string>('');
  const [paymentStarted, setPaymentStarted] = useState<boolean>(false);
  
  // 预设的金额选项
  const amounts = [1, 5, 10, 20, 50, 100];
  
  // 创建订单并获取支付链接
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (amount <= 0) {
      setError('请选择有效的充值金额');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      const response = await fetch('/api/payment/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount }),
      });
      
      const data = await response.json();
      
      if (data.success && data.data?.url) {
        // 保存订单号，用于后续检查支付状态
        setOrderNo(data.data.order_no);
        
        // 在新窗口打开支付链接
        window.open(data.data.url, '_blank');
        
        // 标记支付已开始，显示状态检查组件
        setPaymentStarted(true);
      } else {
        setError(data.error || '创建支付订单失败');
      }
    } catch (err) {
      console.error('支付请求错误:', err);
      setError('请求支付链接时出错，请稍后再试');
    } finally {
      setLoading(false);
    }
  };
  
  // 处理支付成功
  const handlePaymentSuccess = (data: any) => {
    // 重置表单状态
    setAmount(1);
    setOrderNo('');
    setPaymentStarted(false);
    
    // 触发成功回调
    if (onSuccess) {
      onSuccess(data);
    }
  };
  
  // 处理支付错误
  const handlePaymentError = (err: any) => {
    console.warn('支付检查错误:', err);
    // 错误处理已在组件内部完成，这里不需要额外处理
  };
  
  return (
    <div className="payment-form-container">
      <h2 className="form-title">充值点数</h2>
      
      {paymentStarted && orderNo ? (
        <div className="payment-status-container">
          <h3>支付状态检查</h3>
          <p>订单号: {orderNo}</p>
          <p>如果您已完成支付，系统将自动检查支付状态</p>
          
          <CheckPaymentStatus 
            orderNo={orderNo}
            onSuccess={handlePaymentSuccess}
            onError={handlePaymentError}
            maxAttempts={10}
            interval={3000}
            autoStart={true}
          />
          
          <button 
            className="continue-shopping-btn"
            onClick={() => setPaymentStarted(false)}
          >
            继续充值
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="payment-form">
          <div className="form-field">
            <label>选择充值金额</label>
            <div className="amount-options">
              {amounts.map((amt) => (
                <div 
                  key={amt} 
                  className={`amount-option ${amount === amt ? 'selected' : ''}`}
                  onClick={() => setAmount(amt)}
                >
                  <span className="amount-value">{amt}元</span>
                  <span className="amount-points">{amt}点</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="form-field">
            <label htmlFor="custom-amount">自定义金额</label>
            <input
              id="custom-amount"
              type="number"
              min="1"
              max="1000"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="custom-amount-input"
            />
            <span className="credits-preview">可获得 {amount} 点</span>
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button 
            type="submit" 
            className="submit-button"
            disabled={loading || amount <= 0}
          >
            {loading ? '处理中...' : '确认支付'}
          </button>
          
          <div className="payment-note">
            <p>说明：</p>
            <ul>
              <li>1元 = 1点</li>
              <li>充值成功后，点数将立即到账</li>
              <li>如有问题，请联系客服</li>
            </ul>
          </div>
        </form>
      )}
      
      <style jsx>{`
        .payment-form-container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          background-color: white;
        }
        
        .form-title {
          text-align: center;
          margin-bottom: 20px;
          color: #333;
        }
        
        .payment-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .form-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .form-field label {
          font-weight: 500;
          color: #555;
        }
        
        .amount-options {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        
        .amount-option {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .amount-option:hover {
          border-color: #3498db;
        }
        
        .amount-option.selected {
          background-color: #3498db;
          color: white;
          border-color: #3498db;
        }
        
        .amount-value {
          font-size: 18px;
          font-weight: bold;
        }
        
        .amount-points {
          font-size: 14px;
          opacity: 0.8;
        }
        
        .custom-amount-input {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
        }
        
        .credits-preview {
          font-size: 14px;
          color: #2ecc71;
        }
        
        .error-message {
          color: #e74c3c;
          font-size: 14px;
        }
        
        .submit-button {
          background-color: #3498db;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .submit-button:hover {
          background-color: #2980b9;
        }
        
        .submit-button:disabled {
          background-color: #95a5a6;
          cursor: not-allowed;
        }
        
        .payment-note {
          margin-top: 20px;
          padding: 10px;
          background-color: #f8f9fa;
          border-radius: 6px;
          font-size: 14px;
        }
        
        .payment-note ul {
          margin-top: 5px;
          padding-left: 20px;
        }
        
        .payment-status-container {
          text-align: center;
        }
        
        .continue-shopping-btn {
          margin-top: 20px;
          background-color: #2ecc71;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
        }
        
        .continue-shopping-btn:hover {
          background-color: #27ae60;
        }
      `}</style>
    </div>
  );
};

export default PaymentForm; 