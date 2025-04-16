import { useState, useEffect, useRef } from 'react';
import { Clock, ImageIcon, Loader2 } from 'lucide-react';

// 图片生成的不同阶段及其对应信息和描述优化
const GENERATION_STAGES = [
  { id: 'preparing', label: '准备参数', percentage: 5, description: '正在准备生成参数和图像数据' },
  { id: 'configuring', label: '配置API', percentage: 10, description: '正在配置AI模型和生成选项' },
  { id: 'sending_request', label: '发送请求', percentage: 20, description: '正在发送生成请求到AI服务器' },
  { id: 'queuing', label: '排队中', percentage: 25, description: '您的请求正在队列中等待处理' },
  { id: 'processing', label: 'AI处理中', percentage: 60, description: 'AI正在分析内容并创作图像' },
  { id: 'generating', label: '生成图像', percentage: 70, description: 'AI正在绘制您的图像' },
  { id: 'extracting_image', label: '提取图像', percentage: 85, description: '正在从AI响应中提取图像数据' },
  { id: 'finalizing', label: '完成处理', percentage: 95, description: '正在优化并准备显示您的图像' },
  { id: 'completed', label: '图像生成完成', percentage: 100, description: '您的图像已成功生成' },
  { id: 'failed', label: '生成失败', percentage: 0, description: '图像生成过程中遇到错误' }
];

export type GenerationStage = 'preparing' | 'configuring' | 'sending_request' | 'queuing' | 'processing' | 'generating' | 'extracting_image' | 'finalizing' | 'completed' | 'failed';

interface ImageGenerationSkeletonProps {
  taskId?: string;
  isGenerating: boolean;
  stage?: GenerationStage;
  percentage?: number;
  onStageChange?: (stage: string, percentage: number) => void;
}

export function ImageGenerationSkeleton({ 
  taskId, 
  isGenerating,
  stage: externalStage,
  percentage: externalPercentage,
  onStageChange 
}: ImageGenerationSkeletonProps) {
  // 当前阶段索引和详细进度信息
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [progress, setProgress] = useState({ percentage: 0, estimatedTime: '计算中...' });
  const [showDetails, setShowDetails] = useState(false);
  const [smoothProgress, setSmoothProgress] = useState(0); // 平滑进度值
  
  // 计算总耗时
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // 记录开始时间
  const startTimeRef = useRef<number>(Date.now());
  const estimatedTotalTimeRef = useRef<number>(120); // 默认估计2分钟
  const hasUpdatedEstimateRef = useRef<boolean>(false);
  const lastProgressRef = useRef<number>(0); // 记录上一次接收到的进度值
  
  // 重置计时器
  useEffect(() => {
    if (isGenerating) {
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      hasUpdatedEstimateRef.current = false;
      lastProgressRef.current = 0;
      setSmoothProgress(0);
    }
  }, [isGenerating]);
  
  // 允许外部控制进度，添加进度平滑过渡
  useEffect(() => {
    if (externalStage && externalPercentage !== undefined) {
      // 防止进度回退（除非是特殊情况），确保进度条始终向前
      const safePercentage = externalPercentage < lastProgressRef.current 
        ? (externalStage === 'failed' ? 0 : lastProgressRef.current) // 失败时允许回退到0
        : externalPercentage;
        
      // 更新最后一次进度
      lastProgressRef.current = safePercentage;
      
      // 查找外部提供的阶段索引
      const stageIndex = GENERATION_STAGES.findIndex(s => s.id === externalStage);
      if (stageIndex !== -1) {
        setCurrentStageIndex(stageIndex);
        
        // 在首次收到processing阶段的进度更新后，动态调整总时间估计
        if (!hasUpdatedEstimateRef.current && 
            (externalStage === 'processing' || externalStage === 'generating') && 
            safePercentage > 30) {
          const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
          // 基于已用时间和当前进度估计总时间
          const estimatedTotal = Math.ceil((elapsedTime / safePercentage) * 100);
          estimatedTotalTimeRef.current = Math.max(estimatedTotal, 60); // 至少1分钟
          hasUpdatedEstimateRef.current = true;
        }
        
        // 更新进度百分比
        setProgress(prev => ({ 
          ...prev, 
          percentage: safePercentage 
        }));
      }
    }
  }, [externalStage, externalPercentage]);
  
  // 平滑过渡效果
  useEffect(() => {
    if (!isGenerating) {
      setSmoothProgress(0);
      return;
    }
    
    // 目标进度值
    const targetProgress = progress.percentage;
    
    // 如果差距很小，直接设置为目标值
    if (Math.abs(targetProgress - smoothProgress) < 0.5) {
      setSmoothProgress(targetProgress);
      return;
    }
    
    // 否则平滑过渡
    const interval = setInterval(() => {
      setSmoothProgress(current => {
        // 计算新的平滑进度值
        if (targetProgress > current) {
          // 向上过渡，速度随差距变化
          const diff = targetProgress - current;
          const step = Math.max(0.2, Math.min(2, diff * 0.1));
          return Math.min(targetProgress, current + step);
        } else if (targetProgress < current) {
          // 特殊情况：向下过渡（如失败时）
          const diff = current - targetProgress;
          const step = Math.max(0.5, Math.min(5, diff * 0.2));
          return Math.max(targetProgress, current - step);
        }
        return current;
      });
    }, 50); // 更新频率
    
    return () => clearInterval(interval);
  }, [isGenerating, progress.percentage, smoothProgress]);
  
  // 更新已用时间和估计剩余时间
  useEffect(() => {
    if (!isGenerating) {
      return;
    }
    
    const timer = setInterval(() => {
      // 计算已消耗时间
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(elapsed);
      
      // 基于当前进度计算预计剩余时间
      const currentPercentage = progress.percentage || 0;
      if (currentPercentage > 0 && currentPercentage < 100) {
        // 根据已用时间和当前进度预测剩余时间
        const estimatedRemaining = Math.max(
          0, 
          Math.ceil((elapsed / currentPercentage) * (100 - currentPercentage))
        );
        
        // 格式化显示
        let estimatedTimeText;
        if (estimatedRemaining > 120) {
          estimatedTimeText = `约${Math.ceil(estimatedRemaining/60)}分钟`;
        } else if (estimatedRemaining > 60) {
          estimatedTimeText = `约1-2分钟`;
        } else {
          estimatedTimeText = `约${estimatedRemaining}秒`;
        }
        
        setProgress(prev => ({
          ...prev,
          estimatedTime: estimatedTimeText
        }));
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [isGenerating, progress.percentage]);
  
  // 模拟阶段进度 - 仅当没有外部控制时使用
  useEffect(() => {
    if (!isGenerating) {
      setCurrentStageIndex(0);
      setProgress({ percentage: 0, estimatedTime: '计算中...' });
      setElapsedSeconds(0);
      return;
    }
    
    // 只有当没有外部控制时才使用模拟进度
    if (externalStage === undefined && externalPercentage === undefined) {
      // 设置定时器来推进阶段
      let currentIndex = 0;
      
      const timer = setInterval(() => {
        // 根据逝去时间自动推进阶段
        if (elapsedSeconds > 3 && currentIndex === 0) {
          currentIndex = 1;
        } else if (elapsedSeconds > 8 && currentIndex === 1) {
          currentIndex = 2;
        } else if (elapsedSeconds > 15 && currentIndex === 2) {
          currentIndex = 3;
        } else if (elapsedSeconds > 50 && currentIndex === 3) {
          currentIndex = 4;
        } else if (elapsedSeconds > 60 && currentIndex === 4) {
          currentIndex = 5;
        }
        
        if (currentIndex >= GENERATION_STAGES.length - 2) { // 不自动到达completed
          clearInterval(timer);
          return;
        }
        
        // 更新当前阶段和进度
        setCurrentStageIndex(currentIndex);
        setProgress({
          percentage: GENERATION_STAGES[currentIndex].percentage,
          estimatedTime: elapsedSeconds < 10 ? '计算中...' : `约${Math.max(1, Math.ceil((estimatedTotalTimeRef.current - elapsedSeconds) / 60))}分钟`
        });
        
        // 触发阶段变更回调
        if (onStageChange) {
          onStageChange(GENERATION_STAGES[currentIndex].id, GENERATION_STAGES[currentIndex].percentage);
        }
      }, 2000);
      
      return () => clearInterval(timer);
    }
  }, [isGenerating, onStageChange, externalStage, externalPercentage, elapsedSeconds]);
  
  // 获取当前阶段信息
  const currentStage = GENERATION_STAGES[currentStageIndex] || GENERATION_STAGES[0];
  
  // 格式化时间显示
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  };
  
  return (
    <div 
      className="ghibli-image-container aspect-square relative overflow-hidden rounded-xl border border-border/60 shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 bg-gradient-to-br from-card to-background cursor-pointer"
      onClick={() => setShowDetails(!showDetails)}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
        {/* 中心旋转图标 */}
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-primary/70" />
            </div>
          </div>
          <svg className="w-20 h-20 animate-spin-slow" viewBox="0 0 100 100">
            <circle 
              cx="50" cy="50" r="40" 
              fill="none" 
              stroke="rgba(var(--primary-rgb), 0.1)" 
              strokeWidth="8" 
            />
            <circle 
              cx="50" cy="50" r="40" 
              fill="none" 
              stroke="rgba(var(--primary-rgb), 0.8)" 
              strokeWidth="8" 
              strokeDasharray="251" 
              strokeDashoffset={251 - (251 * smoothProgress / 100)}
              strokeLinecap="round" 
              transform="rotate(-90 50 50)" 
              className="transition-all duration-300 ease-in-out"
            />
          </svg>
        </div>
        
        {/* 状态文本 */}
        <div className="text-center">
          <p className="text-lg font-quicksand font-semibold mb-1 text-foreground">
            {currentStage.label}
          </p>
          <p className="text-sm text-muted-foreground mb-2 max-w-[230px]">
            {currentStage.description}
          </p>
          <p className="text-sm text-primary font-medium mb-3">
            {Math.round(smoothProgress)}% 已完成
          </p>
          
          {/* 预计时间 */}
          <div className="flex items-center justify-center text-xs text-muted-foreground">
            <Clock className="w-3 h-3 mr-1" />
            <span>剩余时间: {progress.estimatedTime}</span>
          </div>
          
          {/* 已过时间 */}
          <div className="mt-1 text-xs text-muted-foreground/70">
            已用时间: {formatTime(elapsedSeconds)}
          </div>
          
          {/* 提示点击查看详情 */}
          <div className="mt-2 text-[10px] text-muted-foreground/50 italic">
            点击查看详情
          </div>
        </div>
        
        {/* 详细进度步骤 - 点击骨架图后展示 */}
        {showDetails && (
          <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm p-3 border-t border-border/30 transition-all duration-300">
            <p className="text-xs font-quicksand font-semibold mb-2 text-foreground flex justify-between items-center">
              <span>生成进度详情:</span>
              <span className="text-primary font-medium">{Math.round(smoothProgress)}%</span>
            </p>
            <ul className="text-xs space-y-1 max-h-[150px] overflow-y-auto">
              {GENERATION_STAGES.slice(0, -1).map((stage, index) => (
                <li 
                  key={stage.id} 
                  className={`flex items-center ${index <= currentStageIndex ? 'text-foreground' : 'text-muted-foreground/60'}`}
                >
                  <div className={`w-3 h-3 rounded-full mr-2 ${
                    index < currentStageIndex ? 'bg-primary' : 
                    index === currentStageIndex ? 'bg-primary/60 animate-pulse' : 
                    'bg-muted'
                  }`} />
                  <span>{stage.label}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-2 italic">
              点击收起详情
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 