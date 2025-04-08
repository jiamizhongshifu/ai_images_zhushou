import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Image from 'next/image';
import TaskProgressBar from '../../components/TaskProgressBar';
import { useToast } from '@/components/ui/use-toast';

export default function TaskDetails() {
  const router = useRouter();
  const { taskId } = router.query;
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const supabase = createClientComponentClient();
  const toast = useToast();

  useEffect(() => {
    // 当taskId可用时，获取任务详情
    if (taskId) {
      fetchTaskDetails();
    }
  }, [taskId]);

  // 获取任务详情
  const fetchTaskDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 从API获取详细信息
      const response = await fetch(`/api/task-status?taskId=${taskId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '获取任务详情失败');
      }
      
      if (data.success && data.task) {
        setTask(data.task);
      } else {
        throw new Error('获取任务详情失败');
      }
    } catch (err) {
      console.error('获取任务失败:', err);
      setError(err.message);
      toast({
        title: '获取任务失败',
        description: err.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // 取消任务
  const cancelTask = async () => {
    if (!taskId) return;
    
    try {
      const response = await fetch('/api/cancel-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: '任务已取消',
          type: 'success',
        });
        
        // 刷新任务详情
        fetchTaskDetails();
      } else {
        throw new Error(data.error || '取消任务失败');
      }
    } catch (err) {
      toast({
        title: '取消任务失败',
        description: err.message,
        type: 'error',
      });
    }
  };

  // 获取任务状态标签样式
  const getStatusBadgeProps = (status) => {
    const statusMap = {
      'pending': { color: 'blue', label: '等待处理' },
      'processing': { color: 'yellow', label: '处理中' },
      'completed': { color: 'green', label: '已完成' },
      'failed': { color: 'red', label: '失败' },
      'cancelled': { color: 'gray', label: '已取消' },
    };
    
    return statusMap[status] || { color: 'gray', label: '未知状态' };
  };

  // 页面加载中
  if (loading && !task) {
    return (
      <div className="container mx-auto py-10 max-w-3xl">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p>加载任务信息...</p>
        </div>
      </div>
    );
  }

  // 发生错误
  if (error && !task) {
    return (
      <div className="container mx-auto py-10 max-w-3xl">
        <div className="flex flex-col items-center space-y-4">
          <h2 className="text-red-500 text-lg font-semibold">加载任务失败</h2>
          <p>{error}</p>
          <button onClick={fetchTaskDetails} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">重试</button>
        </div>
      </div>
    );
  }

  // 任务不存在
  if (!task) {
    return (
      <div className="container mx-auto py-10 max-w-3xl">
        <div className="flex flex-col items-center space-y-4">
          <h2 className="text-lg font-semibold">任务不存在或已被删除</h2>
          <button onClick={() => router.push('/dashboard')} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">返回控制台</button>
        </div>
      </div>
    );
  }

  // 任务详情页面
  const { status, prompt, style, result_url, error_message, created_at, completed_at } = task;
  const statusBadge = getStatusBadgeProps(status);

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="flex flex-col space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">任务详情</h1>
          <span className={`px-3 py-1 bg-${statusBadge.color}-100 text-${statusBadge.color}-800 rounded-md text-md`}>
            {statusBadge.label}
          </span>
        </div>
        
        <div>
          <p className="text-sm text-gray-500">任务ID</p>
          <p className="font-mono text-sm">{taskId}</p>
        </div>
        
        <hr className="border-gray-200" />
        
        {/* 进度条显示 - 对于进行中的任务 */}
        {(status === 'pending' || status === 'processing') && (
          <div>
            <TaskProgressBar taskId={taskId} />
          </div>
        )}
        
        {/* 任务内容 */}
        <div>
          <p className="text-sm text-gray-500">提示词</p>
          <p>{prompt}</p>
        </div>
        
        {style && (
          <div>
            <p className="text-sm text-gray-500">风格</p>
            <p>{style}</p>
          </div>
        )}
        
        <div className="flex justify-between">
          <div>
            <p className="text-sm text-gray-500">创建时间</p>
            <p>{new Date(created_at).toLocaleString()}</p>
          </div>
          
          {completed_at && (
            <div>
              <p className="text-sm text-gray-500">完成时间</p>
              <p>{new Date(completed_at).toLocaleString()}</p>
            </div>
          )}
        </div>
        
        {/* 显示处理时间（如果有） */}
        {task.processing_duration_ms && (
          <div>
            <p className="text-sm text-gray-500">处理时间</p>
            <p>{(task.processing_duration_ms / 1000).toFixed(2)}秒</p>
          </div>
        )}
        
        {/* 显示错误信息（如果有） */}
        {error_message && (
          <div className="bg-red-50 p-4 rounded-md">
            <p className="text-sm text-red-500 font-semibold">错误信息</p>
            <p>{error_message}</p>
          </div>
        )}
        
        {/* 显示结果图片（如果有） */}
        {result_url && (
          <div>
            <p className="text-sm text-gray-500 mb-2">生成结果</p>
            <div className="relative w-full h-[500px]">
              <img 
                src={result_url} 
                alt="生成的图像" 
                className="rounded-md max-h-[500px] object-contain"
                style={{ margin: '0 auto' }}
              />
            </div>
          </div>
        )}
        
        {/* 操作按钮 */}
        <div className="flex space-x-4 justify-end">
          <button onClick={() => router.push('/dashboard')} className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
            返回控制台
          </button>
          
          {(status === 'pending' || status === 'processing') && (
            <button onClick={cancelTask} className="px-4 py-2 border border-red-300 text-red-500 rounded-md hover:bg-red-50">
              取消任务
            </button>
          )}
          
          {status === 'completed' && result_url && (
            <a href={result_url} target="_blank" className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
              查看原始图片
            </a>
          )}
        </div>
      </div>
    </div>
  );
} 