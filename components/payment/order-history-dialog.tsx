import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { Badge } from "../ui/badge";
import { formatRelative } from '../../utils/date-format';

// 订单类型定义
interface Order {
  id: string;
  orderNo: string;
  packageId: string;
  packageName?: string;
  credits: number;
  price: number;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  paymentType: string;
}

interface OrderHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  loading: boolean;
  onOrderUpdated?: () => void; // 新增: 订单更新后的回调
}

export default function OrderHistoryDialog({ isOpen, onClose, orders: initialOrders, loading, onOrderUpdated }: OrderHistoryDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null);
  
  // 当外部传入的orders变化时更新内部状态
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  // 格式化日期
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return formatRelative(date);
    } catch (e) {
      return dateString || '未知时间';
    }
  };

  // 获取订单状态标签
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500">支付成功</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500">处理中</Badge>;
      case 'failed':
        return <Badge className="bg-red-500">支付失败</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-500">已取消</Badge>;
      default:
        return <Badge className="bg-gray-500">未知状态</Badge>;
    }
  };

  // 获取支付方式显示文本
  const getPaymentTypeText = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'alipay':
        return '支付宝';
      case 'wxpay':
        return '微信支付';
      default:
        return type || '未知';
    }
  };

  // 清除消息
  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  // 检查订单状态
  const checkOrderStatus = async (orderNo: string) => {
    try {
      clearMessages();
      
      // 查找对应的订单
      const orderToCheck = orders.find(order => order.orderNo === orderNo);
      if (!orderToCheck) {
        throw new Error('未找到订单信息');
      }
      
      // 设置正在检查的订单ID
      setCheckingOrderId(orderToCheck.id);
      
      const response = await fetch(`/api/payment/check?order_no=${orderNo}`);
      
      if (!response.ok) {
        if (response.status === 401) {
          // 401错误特殊处理，可能是会话过期
          console.error('会话可能已过期，需要重新登录');
          setError('会话可能已过期，请刷新页面或重新登录后再试');
          
          // 可以考虑自动刷新页面或重定向到登录页
          setTimeout(() => {
            window.location.reload();
          }, 3000);
          return;
        }
        
        throw new Error(`检查订单失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 使用局部状态更新
        const updatedOrder = data.order;
        
        // 检查API返回的订单状态是否有变化
        if (updatedOrder.status !== orderToCheck.status) {
          // 本地更新订单状态
          const updatedOrders = orders.map(order => 
            order.orderNo === orderNo 
              ? {
                  ...order,
                  status: updatedOrder.status,
                  updatedAt: updatedOrder.updated_at || order.updatedAt
                }
              : order
          );
          
          setOrders(updatedOrders);
          
          // 显示状态变更消息
          setSuccess(`订单 ${orderNo.substring(0, 8)}... 状态已变更为 ${updatedOrder.status === 'success' ? '支付成功' : updatedOrder.status}`);
          
          // 如果状态变为成功，通知父组件刷新点数
          if (updatedOrder.status === 'success' && onOrderUpdated) {
            onOrderUpdated();
          }
        } else {
          // 订单状态未变
          setSuccess(`订单 ${orderNo.substring(0, 8)}... 状态未变化`);
        }
      } else {
        throw new Error(data.error || '订单状态未变化');
      }
    } catch (error) {
      console.error('检查订单状态出错:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`检查订单失败: ${errorMessage}`);
    } finally {
      // 清除正在检查的状态
      setCheckingOrderId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>支付订单历史</DialogTitle>
          <DialogDescription>
            查看您的历史充值订单和支付状态
          </DialogDescription>
        </DialogHeader>
        
        {error && (
          <div className="my-2">
            <div className="flex items-center text-red-500 text-sm p-2 bg-red-50 rounded-md">
              <AlertCircle className="h-4 w-4 mr-2" />
              <span>{error}</span>
            </div>
          </div>
        )}
        
        {success && (
          <div className="my-2">
            <div className="flex items-center text-green-500 text-sm p-2 bg-green-50 rounded-md">
              <CheckCircle className="h-4 w-4 mr-2" />
              <span>{success}</span>
            </div>
          </div>
        )}
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">加载订单历史中...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
            <p className="text-lg font-medium">暂无订单记录</p>
            <p className="text-sm text-muted-foreground mt-1">
              您尚未进行任何充值，开始充值点数以使用更多AI功能吧！
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 text-sm font-medium">订单号</th>
                  <th className="text-left py-2 px-2 text-sm font-medium">套餐</th>
                  <th className="text-left py-2 px-2 text-sm font-medium">金额</th>
                  <th className="text-left py-2 px-2 text-sm font-medium">状态</th>
                  <th className="text-right py-2 px-2 text-sm font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-2 font-mono text-xs">
                      {order.orderNo.substring(0, 8)}...
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex flex-col">
                        <span>{order.packageName || `套餐 #${order.packageId}`}</span>
                        <span className="text-xs text-muted-foreground">{order.credits} 点</span>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex flex-col">
                        <span>¥{order.price}</span>
                        <span className="text-xs text-muted-foreground">{getPaymentTypeText(order.paymentType)}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex space-x-2 items-center">
                        {getStatusBadge(order.status)}
                        {order.status === 'pending' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => checkOrderStatus(order.orderNo)}
                            disabled={checkingOrderId === order.id}
                          >
                            {checkingOrderId === order.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 