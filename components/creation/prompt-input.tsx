import React from "react";
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
  // 处理提示文本变化
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onPromptChange(e.target.value);
  };

  return (
    <div className="space-y-3 w-full">
      <div 
        className="flex flex-col bg-card/70 rounded-xl border border-border hover:border-primary/50 shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 overflow-hidden"
      >
        {/* 文本输入区域 */}
        <Textarea
          placeholder="描述您想要的图像效果..."
          value={prompt}
          onChange={handlePromptChange}
          className="min-h-[120px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-4 text-base font-quicksand placeholder:text-muted-foreground/70"
        />
        
        {/* 操作按钮区 */}
        <div className="flex justify-end items-center p-2 bg-muted/30 border-t border-border">
          {hasLowCredits && (
            <div className="text-amber-500 text-xs flex items-center mr-auto">
              <AlertCircle className="h-3.5 w-3.5 mr-1" />
              积分不足，生成后将扣除全部积分
            </div>
          )}

          <Button
            onClick={onGenerate}
            disabled={!canGenerate || isGenerating}
            size="sm"
            className="bg-gradient-to-br from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 text-primary-foreground shadow-ghibli-sm hover:shadow-ghibli hover:translate-y-[-1px] transition-all duration-300"
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
    </div>
  );
} 