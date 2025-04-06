import React, { useState } from "react";
import { Check } from "lucide-react";
import { Image as ImageIcon } from "lucide-react";
import { StyleConfig } from "@/app/config/styles";

// 风格卡片组件
export default function StyleCard({ 
  style, 
  isActive = false, 
  onClick 
}: { 
  style: StyleConfig;
  isActive: boolean; 
  onClick: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // 处理图片加载成功
  const handleImageLoad = () => {
    setImageLoaded(true);
  };
  
  // 处理图片加载失败
  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };
  
  return (
    <div 
      className={`relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 ghibli-image-container ${
        isActive 
          ? "border-2 border-primary ring-2 ring-primary/20 transform scale-[1.02]" 
          : ""
      }`}
      onClick={onClick}
    >
      {/* 图片预览 */}
      <div className="aspect-square bg-muted relative">
        {/* 未加载状态的背景 */}
        <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-b from-muted/30 to-muted/10 z-0 transition-opacity duration-300 ${
          imageLoaded ? 'opacity-0' : 'opacity-100'
        }`}>
          <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
        </div>
        
        {/* 风格图片 */}
        <img
          src={style.imageUrl || `/examples/placeholder.jpg`}
          alt={`${style.name}风格示例`}
          className={`w-full h-full object-cover relative z-10 transition-all duration-500 ${
            imageLoaded ? 'opacity-100 hover:scale-[1.05]' : 'opacity-0'
          }`}
          loading="lazy"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
        
        {/* 选中指示 */}
        {isActive && (
          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1 z-20 shadow-ghibli-sm animate-pulse-soft">
            <Check className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      
      {/* 风格名称和描述 */}
      <div className="p-2.5 bg-card">
        <h3 className="text-sm font-medium text-center font-quicksand">{style.name}</h3>
      </div>
    </div>
  );
} 