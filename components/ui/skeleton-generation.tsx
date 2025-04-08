import { useState, useEffect, useRef } from 'react';
import { Clock, ImageIcon, Loader2 } from 'lucide-react';

// 图片生成的不同阶段及其对应信息
const GENERATION_STAGES = [
  { id: 'preparing', label: '准备参数', percentage: 5 },
  { id: 'configuring', label: '配置API', percentage: 10 },
  { id: 'sending_request', label: '发送请求', percentage: 20 },
  { id: 'processing', label: 'AI处理中', percentage: 60 },
  { id: 'extracting_image', label: '提取图像', percentage: 85 },
  { id: 'finalizing', label: '完成处理', percentage: 95 },
  { id: 'completed', label: '图像生成完成', percentage: 100 },
  { id: 'failed', label: '生成失败', percentage: 0 }
];

export type GenerationStage = 'preparing' | 'configuring' | 'sending_request' | 'processing' | 'extracting_image' | 'finalizing' | 'completed' | 'failed';

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
  
  // 计算总耗时
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // 记录开始时间
  const startTimeRef = useRef<number>(Date.now());
  const estimatedTotalTimeRef = useRef<number>(120); // 默认估计2分钟
  const hasUpdatedEstimateRef = useRef<boolean>(false);
  
  // 重置计时器
  useEffect(() => {
    if (isGenerating) {
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      hasUpdatedEstimateRef.current = false;
    }
  }, [isGenerating]);
  
  // 允许外部控制进度
  useEffect(() => {
    if (externalStage && externalPercentage !== undefined) {
      // 查找外部提供的阶段索引
      const stageIndex = GENERATION_STAGES.findIndex(s => s.id === externalStage);
      if (stageIndex !== -1) {
        setCurrentStageIndex(stageIndex);
        
        // 在首次收到processing阶段的进度更新后，动态调整总时间估计
        if (!hasUpdatedEstimateRef.current && externalStage === 'processing' && externalPercentage > 30) {
          const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
          // 基于已用时间和当前进度估计总时间
          const estimatedTotal = Math.ceil((elapsedTime / externalPercentage) * 100);
          estimatedTotalTimeRef.current = Math.max(estimatedTotal, 60); // 至少1分钟
          hasUpdatedEstimateRef.current = true;
        }
        
        // 更新进度百分比
        setProgress(prev => ({ 
          ...prev, 
          percentage: externalPercentage 
        }));
      }
    }
  }, [externalStage, externalPercentage]);
  
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
              strokeDashoffset={251 - (251 * progress.percentage / 100)}
              strokeLinecap="round" 
              transform="rotate(-90 50 50)" 
              className="transition-all duration-700 ease-in-out"
            />
          </svg>
        </div>
        
        {/* 状态文本 */}
        <div className="text-center">
          <p className="text-lg font-quicksand font-semibold mb-1 text-foreground">
            {currentStage.label}
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            {progress.percentage}% 已完成
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
        </div>
        
        {/* 详细进度步骤 - 点击骨架图后展示 */}
        {showDetails && (
          <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm p-3 border-t border-border/30 transition-all duration-300">
            <p className="text-xs font-quicksand font-semibold mb-2 text-foreground">
              生成进度详情:
            </p>
            <ul className="text-xs space-y-1">
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