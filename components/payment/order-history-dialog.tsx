import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { Badge } from "../ui/badge";
import { formatRelative } from '../../utils/date-format';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";
import { ReceiptText } from "lucide-react";
import { CREDIT_PACKAGES } from '@/utils/payment';

// 订单类型定义
interface Order {
  id: string;
  orderNo: string;
  packageId: string;
  price: number;
  status: string;
  created_at: string;
  updated_at?: string;
  paymentType?: string;
}

interface OrderHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderUpdated?: (newCredits: number) => void;
}

export default function OrderHistoryDialog({ open, onOpenChange, onOrderUpdated }: OrderHistoryDialogProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  // 获取订单历史
  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/payment/history');
      const data = await response.json();
      
      if (response.ok) {
        setOrders(data.orders);
      } else {
        setError(data.error || '获取订单历史失败');
      }
    } catch (err) {
      setError('获取订单历史失败，请稍后重试');
      console.error('Error fetching order history:', err);
    } finally {
      setLoading(false);
    }
  };

  // 当对话框打开时获取订单
  useEffect(() => {
    if (open) {
      fetchOrders();
    } else {
      setError(null);
      setSuccess(null);
      setChecking(null);
    }
  }, [open]);

  // 检查订单状态
  const checkOrderStatus = async (orderId: string) => {
    setChecking(orderId);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch(`/api/payment/check?order_no=${orderId}`);
      const data = await response.json();
      
      if (response.ok) {
        // 更新本地订单状态
        const updatedOrders = orders.map(order => {
          if (order.orderNo === orderId) {
            return { ...order, status: data.order.status };
          }
          return order;
        });
        
        setOrders(updatedOrders);
        
        if (data.success) {
          const packageInfo = CREDIT_PACKAGES.find(pkg => pkg.id === data.order.packageId);
          const creditsAdded = packageInfo?.credits || 0;
          
          // 处理不同的响应情况
          if (data.creditsUpdated) {
            // 点数已更新的情况
            setSuccess(`订单 ${orderId} 状态更新为 ${getStatusText(data.order.status)}，已添加 ${creditsAdded} 点数`);
            
            // 如果服务器返回了新的点数总额，使用它；否则通过加法计算
            const newCredits = data.newCredits || (data.oldCredits + creditsAdded);
            
            // 通知父组件点数已更新
            if (onOrderUpdated) {
              onOrderUpdated(newCredits);
            }
          } else if (data.order.status === 'success') {
            // 订单成功但尚未更新点数的情况，可能是刚刚成功
            setSuccess(`订单 ${orderId} 状态为 ${getStatusText(data.order.status)}，正在处理点数更新`);
            
            // 尝试再次检查，以便更新点数
            setTimeout(() => checkOrderStatus(orderId), 3000);
          } else {
            // 其他状态的情况
            setSuccess(`订单 ${orderId} 状态: ${getStatusText(data.order.status)}`);
          }
        } else {
          setError(`订单 ${orderId} 状态查询失败: ${data.error || '未知错误'}`);
        }
      } else {
        setError(data.error || '检查订单状态失败');
      }
    } catch (err) {
      setError('检查订单状态失败，请稍后重试');
      console.error('Error checking order status:', err);
    } finally {
      setChecking(null);
    }
  };

  // 获取订单状态文本
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'success':
        return '支付成功';
      case 'pending':
        return '处理中';
      case 'failed':
        return '支付失败';
      default:
        return status;
    }
  };

  // 格式化时间
  const formatTime = (timestamp: string): string => {
    if (!timestamp) return '-';
    try {
      const date = new Date(timestamp);
      
      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        return timestamp;
      }
      
      // 使用更友好的中文日期时间格式
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hour = String(date.getHours()).padStart(2, '0');
      const minute = String(date.getMinutes()).padStart(2, '0');
      const second = String(date.getSeconds()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    } catch (e) {
      console.error("日期格式化错误:", e, timestamp);
      return timestamp;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>充值记录</DialogTitle>
          <DialogDescription>
            查看您的充值订单记录和状态
          </DialogDescription>
        </DialogHeader>
        
        {/* 状态信息 */}
        {success && (
          <Alert className="mb-4 bg-green-50 border-green-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription>{success}</AlertDescription>
            </div>
          </Alert>
        )}
        
        {error && (
          <Alert className="mb-4 bg-red-50 border-red-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <AlertDescription>{error}</AlertDescription>
            </div>
          </Alert>
        )}
        
        {loading ? (
          <div className="py-8 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
            <p className="text-gray-500">正在加载订单历史...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center">
            <ReceiptText className="h-12 w-12 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500">暂无充值记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">订单号</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">套餐</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">金额</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">状态</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">创建时间</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const packageInfo = CREDIT_PACKAGES.find(pkg => pkg.id === order.packageId);
                  
                  return (
                    <tr key={order.id} className="border-t border-gray-200">
                      <td className="px-4 py-3 text-sm">
                        <div className="truncate max-w-[120px]" title={order.orderNo}>
                          {order.orderNo}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {packageInfo ? (
                          <div>
                            <div className="font-medium">{packageInfo.name}</div>
                            <div className="text-xs text-gray-500">{packageInfo.credits} 点数</div>
                          </div>
                        ) : (
                          `套餐 ${order.packageId}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">¥{order.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          order.status === 'success' ? 'bg-green-100 text-green-800' :
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {order.status === 'success' ? <CheckCircle2 className="h-3 w-3 mr-1" /> :
                           order.status === 'pending' ? <Clock className="h-3 w-3 mr-1" /> :
                           <XCircle className="h-3 w-3 mr-1" />}
                          {getStatusText(order.status)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatTime(order.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {order.status !== 'success' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => checkOrderStatus(order.orderNo)}
                            disabled={checking === order.orderNo}
                          >
                            {checking === order.orderNo ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                检查中
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1" />
                                检查状态
                              </>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        <DialogFooter className="mt-4">
          <Button onClick={() => onOpenChange(false)}>关闭</Button>
          <Button variant="outline" onClick={fetchOrders} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                刷新中...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                刷新订单
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 