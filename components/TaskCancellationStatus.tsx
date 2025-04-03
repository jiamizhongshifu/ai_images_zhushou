import { useState, useEffect, useCallback } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "./ui/spinner";
import { X } from "lucide-react";

interface TaskCancellationStatusProps {
  taskId: string;
  onClose: () => void;
}

export function TaskCancellationStatus({ taskId, onClose }: TaskCancellationStatusProps) {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // 使用createClientComponentClient创建单例Supabase客户端 
  const supabase = createClientComponentClient();

  // 使用缓存和API优先的策略获取任务状态
  const fetchTaskStatus = useCallback(async () => {
    if (!taskId) {
      setError("未提供有效的任务ID");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLastUpdated(new Date());
      console.log(`正在获取任务[${taskId}]状态...`);

      // 尝试首先通过API获取任务状态
      try {
        const response = await fetch(`/api/generate-image/task-status?taskId=${taskId}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.task) {
            console.log(`API返回的任务状态:`, data.task);
            setTask(data.task);
            setLoading(false);
            return;
          }
        }
        // 如果API请求失败或没有返回任务，继续尝试数据库查询
        console.log("通过API获取任务状态失败，尝试数据库查询");
      } catch (apiError) {
        console.error("API请求错误:", apiError);
      }

      // 回退到数据库查询
      const { data, error: err } = await supabase
        .from('ai_images_creator_tasks')
        .select('*')
        .eq('taskId', taskId)
        .single();

      if (err) {
        console.error(`数据库查询错误:`, err);
        setError(`获取任务状态失败: ${err.message}`);
        setLoading(false);
        return;
      }

      if (data) {
        console.log(`数据库返回的任务状态:`, data);
        setTask(data);
      } else {
        setError(`未找到任务 ${taskId}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`获取任务状态出错:`, errorMessage);
      setError(`获取任务状态出错: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [taskId, supabase]);

  // 轮询任务状态
  useEffect(() => {
    fetchTaskStatus();

    // 设置轮询，每5秒查询一次，最多12次（1分钟）
    const MAX_POLLS = 12;
    if (pollCount < MAX_POLLS) {
      const timer = setTimeout(() => {
        setPollCount(prev => prev + 1);
        fetchTaskStatus();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [fetchTaskStatus, pollCount]);

  // 格式化日期
  const formatDate = (dateString: string) => {
    if (!dateString) return "未知时间";
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (err) {
      return "日期格式错误";
    }
  };

  // 计算持续时间
  const calculateDuration = (startDate: string, endDate?: string) => {
    if (!startDate) return "未知";

    try {
      const start = new Date(startDate).getTime();
      const end = endDate ? new Date(endDate).getTime() : Date.now();
      const durationMs = end - start;
      
      if (durationMs < 0) return "0秒";
      
      const seconds = Math.floor(durationMs / 1000);
      if (seconds < 60) return `${seconds}秒`;
      
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}分${remainingSeconds}秒`;
    } catch (err) {
      return "计算错误";
    }
  };

  // 获取状态标签
  const getStatusBadge = () => {
    if (!task) return <Badge>未知</Badge>;

    const statusMap: {[key: string]: { label: string, variant: "default" | "destructive" | "outline" | "secondary" }} = {
      'cancelled': { label: "已取消", variant: "destructive" },
      'completed': { label: "已完成", variant: "default" },
      'failed': { label: "失败", variant: "destructive" },
      'pending': { label: "等待中", variant: "secondary" },
      'processing': { label: "处理中", variant: "secondary" }
    };

    const status = task.status || "unknown";
    const config = statusMap[status] || { label: "未知状态", variant: "outline" };

    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="relative pb-2">
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute right-2 top-2" 
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
        <CardTitle className="text-lg">任务取消状态</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Spinner size="lg" />
            <p className="mt-4 text-sm text-muted-foreground">正在获取任务状态...</p>
            <p className="mt-2 text-xs text-muted-foreground">轮询次数: {pollCount}/12</p>
          </div>
        ) : error ? (
          <div className="py-4">
            <p className="text-destructive">{error}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              尝试次数: {pollCount}/12 | 上次更新: {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        ) : !task ? (
          <div className="py-4">
            <p className="text-destructive">未找到任务信息</p>
            <p className="mt-2 text-sm text-muted-foreground">
              任务ID: {taskId} | 尝试次数: {pollCount}/12
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium">状态</h3>
                {getStatusBadge()}
              </div>
              
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium">提示词</h3>
                <p className="text-sm truncate max-w-[200px]">{task.prompt || "无提示词"}</p>
              </div>
              
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium">处理时间</h3>
                <p className="text-sm">{calculateDuration(task.created_at, task.updated_at)}</p>
              </div>
              
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium">点数退还</h3>
                <p className="text-sm">{task.credits_refunded ? "已退还" : "未退还"}</p>
              </div>
              
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium">创建时间</h3>
                <p className="text-sm">{formatDate(task.created_at)}</p>
              </div>
              
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium">更新时间</h3>
                <p className="text-sm">{formatDate(task.updated_at || task.created_at)}</p>
              </div>
              
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium">任务ID</h3>
                <p className="text-sm font-mono">{task.taskId}</p>
              </div>
            </div>
            
            {task.error && (
              <div className="mt-4 p-2 bg-destructive/10 rounded-md">
                <p className="text-sm text-destructive">{task.error}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between pt-0">
        <p className="text-xs text-muted-foreground">
          上次更新: {lastUpdated.toLocaleTimeString()}
        </p>
        <Button variant="outline" size="sm" onClick={() => fetchTaskStatus()}>
          刷新
        </Button>
      </CardFooter>
    </Card>
  );
} 