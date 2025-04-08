import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useToast } from '@/components/ui/use-toast';

// 定义阶段颜色映射
const stageColors = {
  queued: 'gray',
  preparing: 'blue', 
  configuring: 'blue',
  preparing_request: 'cyan',
  sending_request: 'teal',
  request_sent: 'purple',
  processing: 'purple',
  response_received: 'orange',
  processing_response: 'orange',
  extracting_image: 'yellow',
  finalizing: 'green',
  completed: 'green',
  failed: 'red',
  timeout: 'red'
};

// 定义阶段描述
const stageDescriptions = {
  queued: '等待处理',
  preparing: '准备参数',
  configuring: '配置API',
  preparing_request: '准备请求数据',
  sending_request: '发送请求',
  request_sent: '请求已发送',
  processing: 'AI处理中',
  response_received: '收到AI响应',
  processing_response: '处理AI响应',
  extracting_image: '提取图像',
  finalizing: '完成处理',
  completed: '图像生成完成',
  failed: '处理失败',
  timeout: '请求超时'
};

export default function TaskProgressBar({ taskId }) {
  const [progress, setProgress] = useState({
    stage: 'queued',
    percentage: 0,
    details: {}
  });
  const [socket, setSocket] = useState(null);
  const toast = useToast();

  useEffect(() => {
    // 初始化获取任务状态
    const fetchInitialProgress = async () => {
      try {
        const res = await fetch(`/api/task-status?taskId=${taskId}`);
        const data = await res.json();
        
        if (data.success && data.task) {
          setProgress({
            stage: data.task.current_stage || 'queued',
            percentage: data.task.progress_percentage || 0,
            details: data.task.stage_details || {}
          });
        }
      } catch (error) {
        console.error('获取任务状态失败:', error);
      }
    };
    
    fetchInitialProgress();
    
    // 初始化WebSocket连接
    const socketInit = async () => {
      try {
        await fetch('/api/task-progress-socket');
        
        const socket = io();
        
        socket.on('connect', () => {
          console.log('Socket已连接，订阅任务:', taskId);
          socket.emit('subscribe', taskId);
        });
        
        socket.on('connect_error', (err) => {
          console.error('Socket连接错误:', err);
          toast({
            title: 'WebSocket连接失败',
            description: '将使用轮询方式获取进度更新',
            type: 'warning',
          });
          
          // 如果WebSocket连接失败，使用轮询作为备选方案
          startPolling();
        });
        
        socket.on('progress', (data) => {
          if (data.taskId === taskId) {
            console.log('收到进度更新:', data);
            setProgress({
              stage: data.stage,
              percentage: data.percentage,
              details: data.details
            });
            
            // 特殊情况通知
            if (data.stage === 'completed' && data.percentage === 100) {
              toast({
                title: '任务完成',
                description: '图像生成已完成',
                type: 'success',
              });
            } else if (data.stage === 'failed') {
              toast({
                title: '任务失败',
                description: data.details?.message || '处理过程中出错',
                type: 'error',
              });
            }
          }
        });
        
        setSocket(socket);
      } catch (error) {
        console.error('初始化Socket失败:', error);
        startPolling(); // 作为备选方案，启动轮询
      }
    };
    
    // 备选的轮询方案
    let pollingInterval;
    const startPolling = () => {
      pollingInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/task-status?taskId=${taskId}`);
          const data = await res.json();
          
          if (data.success && data.task) {
            setProgress({
              stage: data.task.current_stage || 'queued',
              percentage: data.task.progress_percentage || 0,
              details: data.task.stage_details || {}
            });
            
            // 如果任务已完成，停止轮询
            if (['completed', 'failed'].includes(data.task.status)) {
              clearInterval(pollingInterval);
            }
          }
        } catch (error) {
          console.error('轮询任务状态失败:', error);
        }
      }, 2000); // 每2秒轮询一次
    };
    
    socketInit();
    
    // 组件卸载清理
    return () => {
      if (socket) {
        socket.off('progress');
        socket.off('connect');
        socket.off('connect_error');
        socket.disconnect();
      }
      
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [taskId, toast]);

  // 自定义进度条组件
  const ProgressBar = ({ percentage, color }) => (
    <div className="w-full h-2 bg-gray-200 rounded-full mt-2 mb-2">
      <div 
        className={`h-full rounded-full bg-${color}-500 transition-all duration-300 ease-in-out relative`}
        style={{ width: `${percentage}%` }}
      >
        {progress.stage !== 'completed' && progress.stage !== 'failed' && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent bg-[length:200%_100%] animate-shimmer rounded-full" />
        )}
      </div>
    </div>
  );

  const color = stageColors[progress.stage] || 'gray';
  const description = stageDescriptions[progress.stage] || '未知状态';

  return (
    <div className="border border-gray-200 rounded-lg p-4 w-full shadow-sm">
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 1.5s infinite;
        }
      `}</style>
      
      <div className="flex flex-col space-y-1">
        <div className="flex justify-between items-center">
          <p className="font-bold text-md">图像生成进度</p>
          <span className={`px-2 py-1 rounded-md bg-${color}-100 text-${color}-800 text-sm`}>
            {description}
          </span>
        </div>
        
        <ProgressBar percentage={progress.percentage} color={color} />
        
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-600">
            {progress.details?.message || '正在处理...'}
          </p>
          <p className="text-sm font-bold">
            {progress.percentage}%
          </p>
        </div>
        
        {progress.details?.estimatedTimeRemaining && progress.stage !== 'completed' && (
          <p className="text-xs mt-1 text-gray-500 text-right">
            预计剩余: {progress.details.estimatedTimeRemaining}
          </p>
        )}
        
        {progress.details?.processingTime && progress.stage === 'completed' && (
          <p className="text-xs mt-1 text-gray-500 text-right">
            处理时间: {Math.round(progress.details.processingTime / 1000)}秒
          </p>
        )}
      </div>
    </div>
  );
} 