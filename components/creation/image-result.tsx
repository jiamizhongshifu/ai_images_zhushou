import React, { useState } from "react";
import { Download, Loader2, Trash, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageError } from "@/components/ui/loading-states";

interface ImageResultProps {
  image: string | null;
  loading: boolean;
  onDownload?: () => void;
  onDelete?: () => void;
  error?: string | null;
}

export default function ImageResult({
  image,
  loading,
  onDownload,
  onDelete,
  error,
}: ImageResultProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // 处理图片加载成功
  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  // 处理图片加载失败
  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <Card className="rounded-xl bg-card/60 border border-border shadow-ghibli-sm transition-all duration-300 hover:shadow-ghibli">
      <CardContent className="p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium font-quicksand text-foreground/90">AI 生成结果</h3>
          
          {/* 操作按钮 */}
          <div className="flex space-x-2">
            {image && !loading && !error && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onDownload}
                className="flex items-center text-sm bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
                disabled={loading || !image}
                title="保存图片到本地"
              >
                <Download className="h-4 w-4 mr-1" />
                保存
              </Button>
            )}
            
            {image && !loading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="flex items-center text-sm hover:bg-destructive/10 hover:text-destructive"
                title="清除生成结果"
              >
                <Trash className="h-4 w-4 mr-1" />
                删除
              </Button>
            )}
          </div>
        </div>
        
        {/* 图片容器 */}
        <div className="relative min-h-[300px] rounded-lg overflow-hidden border border-border/50">
          {/* 加载状态 */}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm animate-fade-in z-10">
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <p className="text-base text-foreground/70 font-quicksand">AI 正在创作中...</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs text-center">
                首次生成可能需要较长时间，请耐心等待
              </p>
            </div>
          )}
          
          {/* 错误状态 */}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
              <ImageError message={error} />
            </div>
          )}
          
          {/* 图片预览 */}
          {image && !error ? (
            <div className={`w-full h-full flex items-center justify-center ${!imageLoaded && !loading ? 'bg-muted/30' : ''}`}>
              <LazyImage
                src={image}
                alt="AI 生成的图片"
                className="max-h-[500px] w-auto object-contain"
                onImageLoad={handleImageLoad}
                onImageError={handleImageError}
                fadeIn={true}
                blurEffect={true}
              />
            </div>
          ) : !loading && !error ? (
            <div className="flex flex-col items-center justify-center h-[300px] bg-muted/20 text-center p-6">
              <div className="bg-primary/10 p-3 rounded-full mb-4">
                <Info className="h-6 w-6 text-primary/60" />
              </div>
              <p className="text-muted-foreground font-nunito mb-2">
                请先上传图片或输入提示词生成 AI 图片
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                高质量的提示词和参考图片将帮助 AI 创造出更好的结果
              </p>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
} 