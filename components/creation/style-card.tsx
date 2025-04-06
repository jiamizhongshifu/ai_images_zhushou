import React from "react";
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
  return (
    <div 
      className={`relative rounded-lg overflow-hidden cursor-pointer transition-all ${
        isActive 
          ? "border border-primary ring-2 ring-primary/20" 
          : "border border-border hover:border-primary/50"
      }`}
      onClick={onClick}
    >
      {/* 图片预览 */}
      <div className="aspect-square bg-muted relative">
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-muted/30 to-muted/10 z-0">
          <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
        </div>
        <img
          src={style.imageUrl || `/examples/placeholder.jpg`}
          alt={`${style.name}风格示例`}
          className="w-full h-full object-cover relative z-10"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.opacity = "0.3";
            e.currentTarget.style.zIndex = "0";
          }}
        />
        
        {/* 选中指示 */}
        {isActive && (
          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1 z-20">
            <Check className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      
      {/* 风格名称和描述 */}
      <div className="p-2 bg-card">
        <h3 className="text-sm font-medium text-center">{style.name}</h3>
      </div>
    </div>
  );
} 