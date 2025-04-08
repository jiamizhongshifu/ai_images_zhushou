import React, { useState, useCallback, useRef, useEffect } from "react";
import { Loader2, X, Download, Trash2, ChevronRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageError, ImageLoading } from "@/components/ui/loading-states";
import { useRouter } from "next/navigation";
import { ImageGenerationSkeleton, GenerationStage } from "@/components/ui/skeleton-generation";

// 一次性渲染的最大图片数量
const MAX_VISIBLE_IMAGES = 12;

interface GeneratedImageGalleryProps {
  images: string[];
  isLoading: boolean;
  onImageLoad: (imageUrl: string) => void;
  onImageError: (imageUrl: string) => void;
  onDownloadImage: (imageUrl: string) => void;
  onDeleteImage?: (imageUrl: string) => Promise<void>;
  hideViewMoreButton?: boolean;
  isLargerSize?: boolean;
  maxRows?: number;
  isGenerating?: boolean;
  generationStage?: GenerationStage;
  generationPercentage?: number;
  onStageChange?: (stage: string, percentage: number) => void;
}

export default function GeneratedImageGallery({
  images,
  isLoading,
  onImageLoad,
  onImageError,
  onDownloadImage,
  onDeleteImage,
  hideViewMoreButton = false,
  isLargerSize = false,
  maxRows,
  isGenerating = false,
  generationStage,
  generationPercentage,
  onStageChange
}: GeneratedImageGalleryProps) {
  const router = useRouter();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [errorImages, setErrorImages] = useState<Record<string, boolean>>({});
  const [visibleCount, setVisibleCount] = useState<number>(MAX_VISIBLE_IMAGES);
  
  const gridRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // 处理加载更多图片
  const handleLoadMore = useCallback(() => {
    setVisibleCount(prevCount => prevCount + MAX_VISIBLE_IMAGES);
  }, []);
  
  // 设置交叉观察器监听"加载更多"元素
  useEffect(() => {
    if (!loadMoreRef.current) return;
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isLoading && images.length > visibleCount) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );
    
    observerRef.current.observe(loadMoreRef.current);
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isLoading, images.length, visibleCount, handleLoadMore]);
  
  // 图片列表变更时重置可见图片数量
  useEffect(() => {
    if (images.length === 0) return;
    setVisibleCount(MAX_VISIBLE_IMAGES);
  }, [images]);
  
  // 查看更多，跳转到历史页
  const handleViewMore = () => {
    router.push("/protected/history");
  };
  
  // 处理删除图片
  const handleDeleteImage = async (imageUrl: string) => {
    if (!onDeleteImage) return;
    
    try {
      if (confirm("确定要删除这张图片吗？此操作不可撤销。")) {
        await onDeleteImage(imageUrl);
        
        // 如果当前预览的图片被删除，关闭预览
        if (previewImage === imageUrl) {
          setPreviewImage(null);
        }
        
        // 清除加载状态
        setLoadedImages(prev => {
          const newState = {...prev};
          delete newState[imageUrl];
          return newState;
        });
      }
    } catch (error) {
      console.error("删除图片失败:", error);
    }
  };
  
  // 处理图片加载
  const handleImageLoad = useCallback((imageUrl: string) => {
    setLoadedImages(prev => ({...prev, [imageUrl]: true}));
    onImageLoad(imageUrl);
  }, [onImageLoad]);
  
  // 处理图片加载错误
  const handleImageError = useCallback((imageUrl: string) => {
    setErrorImages(prev => ({...prev, [imageUrl]: true}));
    onImageError(imageUrl);
  }, [onImageError]);

  // 构建CSS类名
  const gridClassName = isLargerSize 
    ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 relative" 
    : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 relative";

  // 基于maxRows限制计算额外的样式
  const gridStyle = maxRows ? { 
    maxHeight: maxRows === 1 ? 'auto' : `calc(${maxRows} * (100% / 4 + 1rem))`, 
    overflow: 'hidden' 
  } : {};

  // 判断是否显示骨架屏 - 修改为始终在生成过程中显示
  const shouldShowSkeleton = isGenerating;
  
  // 计算要显示的图片
  let displayImages = images;
  if (maxRows) {
    const limit = maxRows * (isLargerSize ? 3 : 4) - (shouldShowSkeleton ? 1 : 0);
    displayImages = images.slice(0, limit);
  } else {
    // 限制同时加载的图片数量
    displayImages = images.slice(0, visibleCount);
  }
  
  // 是否还有更多图片可以加载
  const hasMoreImages = !maxRows && images.length > visibleCount;

  return (
    <div className="relative">
      {/* 显示图片网格或加载状态 */}
      <div className={gridClassName} style={gridStyle} ref={gridRef}>
        {/* 生成中骨架屏 - 始终显示在第一位 */}
        {shouldShowSkeleton && (
          <div className="col-span-1">
            <ImageGenerationSkeleton 
              isGenerating={isGenerating}
              stage={generationStage}
              percentage={generationPercentage}
              onStageChange={onStageChange}
            />
          </div>
        )}
        
        {/* 加载状态 - 不影响骨架屏显示 */}
        {isLoading && !shouldShowSkeleton && (
          <div className="col-span-full flex items-center justify-center py-14">
            <div className="flex flex-col items-center bg-card/60 p-6 rounded-xl border border-border shadow-ghibli-sm animate-pulse-soft">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-foreground/90 font-quicksand">正在加载图片，请稍候...</p>
            </div>
          </div>
        )}
        
        {/* 空状态 - 只在没有生成中和没有图片时显示 */}
        {!isLoading && !isGenerating && images.length === 0 && (
          <div className="col-span-full py-14 flex flex-col items-center justify-center">
            <div className="bg-card/60 p-6 rounded-xl border border-border flex flex-col items-center shadow-ghibli-sm">
              <div className="bg-muted/50 rounded-full p-3 mb-3">
                <ImageIcon className="h-6 w-6 text-primary/60" />
              </div>
              <p className="text-foreground/80 mb-1.5 font-quicksand">暂无生成的图片</p>
              <p className="text-xs text-muted-foreground">上传照片并选择风格，开始创作</p>
            </div>
          </div>
        )}
        
        {/* 优化后的图片渲染 - 只渲染可见范围内的图片 */}
        {displayImages.map((imageUrl, index) => (
          <div
            key={`${imageUrl}-${index}`}
            className="ghibli-image-container aspect-square relative overflow-hidden rounded-xl border border-border/40 cursor-pointer shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 hover:border-border/60 animate-fade-in"
            onClick={() => setPreviewImage(imageUrl)}
          >
            {/* 图片加载中状态 */}
            {!loadedImages[imageUrl] && !errorImages[imageUrl] && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/60 backdrop-blur-sm z-10">
                <ImageLoading message="加载中..." />
              </div>
            )}
            
            {/* 图片加载错误状态 */}
            {errorImages[imageUrl] && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/60 backdrop-blur-sm z-10">
                <ImageError message="加载失败" />
              </div>
            )}
            
            <div className="w-full h-full relative">
              <LazyImage
                src={imageUrl}
                alt={`生成的图片 ${index + 1}`}
                className="object-cover w-full h-full transition-transform duration-700 hover:scale-[1.05]"
                onImageLoad={() => handleImageLoad(imageUrl)}
                onImageError={() => handleImageError(imageUrl)}
                fadeIn={true}
                blurEffect={true}
                // 设置最前面几张图片为高优先级
                priority={index < 4}
              />
            </div>
            
            {/* 图片操作按钮 - 鼠标悬停时显示 */}
            <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white shadow-ghibli-sm backdrop-blur-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownloadImage(imageUrl);
                }}
                title="下载"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              
              {onDeleteImage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-destructive/40 hover:bg-destructive/60 text-white shadow-ghibli-sm backdrop-blur-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteImage(imageUrl);
                  }}
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* 加载更多指示器 */}
      {hasMoreImages && (
        <div 
          ref={loadMoreRef}
          className="w-full flex justify-center items-center py-8 mt-4 opacity-80 cursor-pointer"
          onClick={handleLoadMore}
        >
          <div className="flex flex-col items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary mb-1" />
            <p className="text-sm text-primary">加载更多图片</p>
          </div>
        </div>
      )}
      
      {/* 查看更多按钮 - 只在需要时显示 */}
      {!hideViewMoreButton && !isLoading && images.length > 0 && (
        <div className="flex justify-end mt-5">
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
            onClick={handleViewMore}
          >
            查看更多
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
      
      {/* 图片预览模态框 */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="relative max-w-4xl max-h-[90vh] w-full animate-scale-in">
            {/* 关闭按钮 */}
            <div className="absolute -top-12 right-0 flex justify-end">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 rounded-full bg-background/20 text-white hover:bg-background/40 backdrop-blur-sm"
                onClick={() => setPreviewImage(null)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            {/* 图片预览 */}
            <div className="bg-card/95 backdrop-blur-md rounded-xl overflow-hidden shadow-ghibli border border-border/50">
              <div className="relative aspect-auto max-h-[80vh] flex items-center justify-center p-4">
                <LazyImage
                  src={previewImage}
                  alt="预览图片"
                  className="max-w-full max-h-[70vh] object-contain"
                  fadeIn={true}
                  blurEffect={true}
                  priority={true}
                />
              </div>
              
              {/* 图片操作栏 */}
              <div className="bg-card/90 border-t border-border/30 p-4 flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  {/* 显示当前预览的是第几张图片，总共几张 */}
                  {images.indexOf(previewImage) !== -1 && (
                    <span>图片 {images.indexOf(previewImage) + 1} / {images.length}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-background/80 hover:bg-background/60 text-foreground"
                    onClick={() => onDownloadImage(previewImage)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    下载
                  </Button>
                  {onDeleteImage && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/20"
                      onClick={() => {
                        handleDeleteImage(previewImage);
                        setPreviewImage(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      删除
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 