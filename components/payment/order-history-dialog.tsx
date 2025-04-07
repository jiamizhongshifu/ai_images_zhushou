import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { Badge } from "../ui/badge";
import { formatRelative } from '@/utils/date-format';

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
}

export default function OrderHistoryDialog({ isOpen, onClose, orders, loading }: OrderHistoryDialogProps) {
  const [error, setError] = useState<string | null>(null);

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

  // 检查订单状态
  const checkOrderStatus = async (orderNo: string) => {
    try {
      setError(null);
      
      const response = await fetch(`/api/payment/check?order_no=${orderNo}`);
      if (!response.ok) {
        throw new Error(`检查订单失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 刷新整个订单列表
        window.location.reload();
      } else {
        throw new Error(data.error || '订单状态未变化');
      }
    } catch (error) {
      console.error('检查订单状态出错:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`检查订单失败: ${errorMessage}`);
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
                          >
                            <RefreshCw className="h-3 w-3" />
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