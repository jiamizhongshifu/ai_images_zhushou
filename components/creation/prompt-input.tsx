import React, { useState } from "react";
import { Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface PromptInputProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
  hasLowCredits?: boolean;
}

export default function PromptInput({
  prompt,
  onPromptChange,
  onGenerate,
  isGenerating,
  canGenerate,
  hasLowCredits = false,
}: PromptInputProps) {
  const [focused, setFocused] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  
  // 处理提示文本变化
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    onPromptChange(value);
    setShowPlaceholder(value.length === 0);
  };
  
  // 处理焦点事件
  const handleFocus = () => {
    setFocused(true);
    if (prompt.length === 0) {
      setShowPlaceholder(true);
    }
  };
  
  const handleBlur = () => {
    setFocused(false);
  };
  
  return (
    <div className="space-y-3 w-full">
      <div 
        className={`flex flex-col bg-card/70 rounded-xl border transition-all duration-300 overflow-hidden shadow-ghibli-sm 
                   ${focused ? 'border-primary/50 shadow-ghibli' : 'border-border hover:border-primary/30 hover:shadow-ghibli'}`}
      >
        {/* 文本输入区域 */}
        <div className="relative">
          <Textarea
            value={prompt}
            onChange={handlePromptChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className="min-h-[120px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-4 text-base font-quicksand placeholder:text-transparent"
            disabled={isGenerating}
            placeholder=" "
          />
          
          {/* 自定义占位符 - 仅在文本为空时显示 */}
          {showPlaceholder && (
            <div className={`absolute top-4 left-4 text-muted-foreground/70 pointer-events-none transition-opacity duration-300 ${
              focused ? 'opacity-70' : 'opacity-100'
            }`}>
              描述您想要的图像效果...
            </div>
          )}
        </div>
        
        {/* 操作按钮区 */}
        <div className="flex justify-end items-center p-2.5 bg-muted/30 border-t border-border">
          {hasLowCredits && (
            <div className="text-amber-500 text-xs flex items-center mr-auto animate-pulse-soft">
              <AlertCircle className="h-3.5 w-3.5 mr-1" />
              积分不足，生成后将扣除全部积分
            </div>
          )}

          <Button
            onClick={onGenerate}
            disabled={!canGenerate || isGenerating}
            size="sm"
            className="ghibli-btn-primary"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                开始生成
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* 提示文本计数 */}
      <div className="flex justify-end">
        <span className={`text-xs transition-colors duration-300 ${
          prompt.length > 300 ? 'text-amber-500' : 
          prompt.length > 200 ? 'text-muted-foreground' : 
          'text-muted-foreground/70'
        }`}>
          {prompt.length} / 500 字符
        </span>
      </div>
    </div>
  );
} 