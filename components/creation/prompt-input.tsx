import React from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface PromptInputProps {
  prompt: string;
  onPromptChange: (value: string) => void;
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
  hasLowCredits = false
}: PromptInputProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">提示词</h3>
      <Textarea
        placeholder="描述您想要生成的图片内容，例如：一只可爱的柴犬在花园里..."
        value={prompt}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onPromptChange(e.target.value)}
        className="min-h-[120px] resize-none"
        disabled={isGenerating}
      />
      <p className="text-xs text-muted-foreground">
        详细的描述可以帮助AI更好地理解您的意图
      </p>
      
      <Button 
        className="w-full py-6 text-lg transition-all shadow-md hover:shadow-lg" 
        onClick={onGenerate}
        disabled={isGenerating || !canGenerate || hasLowCredits}
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span>正在生成中...</span>
          </>
        ) : (
          <>
            <span>开始生成图片</span>
            <SendHorizontal className="ml-2 h-5 w-5" />
          </>
        )}
      </Button>
      
      {hasLowCredits && (
        <p className="text-xs text-destructive mt-2 text-center">点数不足，请先充值</p>
      )}
    </div>
  );
} 