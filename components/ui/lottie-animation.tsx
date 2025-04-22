import React, { useState, useEffect } from 'react';
import Lottie from 'lottie-react';

interface LottieAnimationProps {
  animationData?: any;
  animationPath?: string;
  loop?: boolean;
  autoplay?: boolean;
  style?: React.CSSProperties;
  className?: string;
  width?: number | string;
  height?: number | string;
}

export const LottieAnimation: React.FC<LottieAnimationProps> = ({
  animationData,
  animationPath,
  loop = true,
  autoplay = true,
  style,
  className = '',
  width,
  height
}) => {
  const [loadedAnimation, setLoadedAnimation] = useState<any>(animationData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 如果直接提供了animationData，则不需要加载
    if (animationData) {
      setLoadedAnimation(animationData);
      return;
    }

    // 如果提供了动画路径，则加载动画文件
    if (animationPath) {
      setIsLoading(true);
      setError(null);
      
      fetch(animationPath)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to load animation: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          setLoadedAnimation(data);
          setIsLoading(false);
        })
        .catch(err => {
          console.error('Error loading Lottie animation:', err);
          setError(err.message || 'Failed to load animation');
          setIsLoading(false);
        });
    }
  }, [animationData, animationPath]);

  return (
    <div className={className} style={{ width, height, ...style }}>
      {isLoading ? (
        <div className="flex items-center justify-center w-full h-full">
          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <div className="text-xs text-red-500">{error}</div>
      ) : loadedAnimation ? (
        <Lottie 
          animationData={loadedAnimation} 
          loop={loop} 
          autoplay={autoplay}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <div className="text-xs text-muted-foreground">未提供动画数据</div>
      )}
    </div>
  );
};

export default LottieAnimation; 