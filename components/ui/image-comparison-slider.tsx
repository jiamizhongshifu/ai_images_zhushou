"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ImageComparisonSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeAlt?: string;
  afterAlt?: string;
  className?: string;
}

export function ImageComparisonSlider({
  beforeImage,
  afterImage,
  beforeAlt = "原始图片",
  afterAlt = "处理后图片",
  className,
}: ImageComparisonSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = () => {
    isDragging.current = true;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    
    let clientX;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
    } else {
      clientX = e.clientX;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const containerWidth = rect.width;
    const position = ((clientX - rect.left) / containerWidth) * 100;
    
    setSliderPosition(Math.max(0, Math.min(100, position)));
  };

  const handleTouchStart = () => {
    isDragging.current = true;
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDragging.current = false;
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('touchend', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative w-full h-full overflow-hidden rounded-xl select-none cursor-ew-resize", 
        className
      )}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleMouseMove}
    >
      {/* 底层：after图片 */}
      <div className="absolute inset-0">
        <img
          src={afterImage}
          alt={afterAlt}
          className="h-full w-full object-cover"
        />
      </div>
      
      {/* 上层：before图片，使用裁剪方式控制可见区域 */}
      <div 
        className="absolute inset-0 overflow-hidden"
        style={{ 
          clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`
        }}
      >
        <img
          src={beforeImage}
          alt={beforeAlt}
          className="h-full w-full object-cover"
        />
      </div>
      
      {/* 滑块控制器 */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-md cursor-ew-resize z-10"
        style={{ left: `${sliderPosition}%` }}
      >
        {/* 滑块圆点 */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center border border-gray-200">
          <div className="flex flex-col gap-[2px]">
            <div className="w-[6px] h-[1px] bg-gray-400 rounded-full"></div>
            <div className="w-[6px] h-[1px] bg-gray-400 rounded-full"></div>
            <div className="w-[6px] h-[1px] bg-gray-400 rounded-full"></div>
          </div>
        </div>
      </div>
      
      {/* 标签 */}
      <div className="absolute top-3 left-3 bg-black/50 text-white text-xs px-2 py-1 rounded-md">BEFORE</div>
      <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-md">AFTER</div>
    </div>
  );
} 