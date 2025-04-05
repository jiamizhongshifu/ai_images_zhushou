'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, CheckCircle, RefreshCcw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// 定义组件属性类型
interface PaymentMonitorProps {
  className?: string;
}

// 支付状态监控组件
export default function PaymentMonitor({ className }: PaymentMonitorProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<{
    recent: Array<{
      id: string;
      order_no: string;
      status: string;
      amount: number;
      created_at: string;
      paid_at?: string;
    }>;
    counters: {
      total: number;
      success: number;
      pending: number;
      failed: number;
    };
    errors?: Array<{
      type: string;
      count: number;
      recent: string;
    }>;
  }>({
    recent: [],
    counters: {
      total: 0,
      success: 0,
      pending: 0,
      failed: 0
    }
  });

  // 加载支付统计数据
  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/payment/stats');
      
      if (!response.ok) {
        throw new Error(`获取支付统计失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
      } else {
        throw new Error(data.error || '获取支付统计失败');
      }
    } catch (error) {
      console.error('加载支付统计出错:', error);
      toast({
        title: '加载失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 首次加载数据
  useEffect(() => {
    loadStats();
  }, []);

  // 刷新数据
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  // 修复悬挂订单
  const handleFixPending = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/admin/payment/fix-all-pending');
      
      if (!response.ok) {
        throw new Error(`修复订单失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: '修复成功',
          description: `已成功修复 ${data.fixed} 个订单`,
          variant: 'default',
        });
        
        // 重新加载统计数据
        await loadStats();
      } else {
        throw new Error(data.error || '修复订单失败');
      }
    } catch (error) {
      console.error('修复订单出错:', error);
      toast({
        title: '修复失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 格式化日期显示
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className={className}>
      <CardHeader className="space-y-1">
        <div className="flex justify-between items-center">
          <CardTitle className="text-2xl">支付监控</CardTitle>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
          </Button>
        </div>
        <CardDescription>
          实时监控支付状态和处理情况
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* 统计数字 */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                title="总订单"
                value={stats.counters.total}
                variant="default"
              />
              <StatCard
                title="成功"
                value={stats.counters.success}
                variant="success"
              />
              <StatCard
                title="待处理"
                value={stats.counters.pending}
                variant="warning"
              />
              <StatCard
                title="失败"
                value={stats.counters.failed}
                variant="destructive"
              />
            </div>

            {/* 最近订单列表 */}
            <div className="mt-4">
              <h3 className="font-semibold mb-2">最近订单</h3>
              <div className="space-y-2">
                {stats.recent.length > 0 ? (
                  stats.recent.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-md"
                    >
                      <div className="space-y-1">
                        <div className="font-medium">
                          订单: {order.order_no.slice(-8)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(order.created_at)}
                          {order.paid_at && ` → ${formatDate(order.paid_at)}`}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div>¥{order.amount.toFixed(2)}</div>
                        <OrderStatusBadge status={order.status} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    暂无订单数据
                  </div>
                )}
              </div>
            </div>

            {/* 错误统计 */}
            {stats.errors && stats.errors.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold mb-2">错误统计</h3>
                <div className="space-y-2">
                  {stats.errors.map((error, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-destructive/10 rounded-md"
                    >
                      <div className="space-y-1">
                        <div className="font-medium">{error.type}</div>
                        <div className="text-xs text-muted-foreground">
                          最近: {error.recent}
                        </div>
                      </div>
                      <Badge variant="destructive">{error.count}次</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
      
      <CardFooter>
        <Button
          className="w-full"
          onClick={handleFixPending}
          disabled={loading || refreshing || stats.counters.pending === 0}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <AlertCircle className="mr-2 h-4 w-4" />
          )}
          修复所有待处理订单
        </Button>
      </CardFooter>
    </Card>
  );
}

// 统计卡片组件
function StatCard({
  title,
  value,
  variant = 'default'
}: {
  title: string;
  value: number;
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const bgColor = {
    default: 'bg-muted',
    success: 'bg-green-50',
    warning: 'bg-amber-50',
    destructive: 'bg-red-50'
  }[variant];
  
  const textColor = {
    default: 'text-foreground',
    success: 'text-green-700',
    warning: 'text-amber-700',
    destructive: 'text-red-700'
  }[variant];

  return (
    <div className={`p-4 rounded-lg ${bgColor}`}>
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
    </div>
  );
}

// 订单状态徽章
function OrderStatusBadge({ status }: { status: string }) {
  let variant: 'default' | 'success' | 'warning' | 'destructive' = 'default';
  let label = status;

  switch (status) {
    case 'success':
      variant = 'success';
      label = '成功';
      break;
    case 'pending':
      variant = 'warning';
      label = '待处理';
      break;
    case 'failed':
      variant = 'destructive';
      label = '失败';
      break;
  }

  return (
    <Badge variant={variant}>
      {status === 'success' && <CheckCircle className="w-3 h-3 mr-1" />}
      {status === 'pending' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {status === 'failed' && <AlertCircle className="w-3 h-3 mr-1" />}
      {label}
    </Badge>
  );
} 