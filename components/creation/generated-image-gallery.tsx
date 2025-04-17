import React, { useState, useCallback, useRef, useEffect } from "react";
import { Loader2, X, Download, Trash2, ChevronRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageError, ImageLoading } from "@/components/ui/loading-states";
import { useRouter } from "next/navigation";
import { ImageGenerationSkeleton, GenerationStage } from "@/components/ui/skeleton-generation";
import useImageHandling from "@/hooks/useImageHandling";

// 一次性渲染的最大图片数量
const MAX_VISIBLE_IMAGES = 12;
// 滚动防抖时间（毫秒）
const SCROLL_DEBOUNCE_TIME = 150;

// 防抖函数
function debounce(fn: Function, ms: number) {
  let timer: NodeJS.Timeout;
  return function(...args: any[]) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export interface GeneratedImageGalleryProps extends React.PropsWithChildren {
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
  onStageChange?: (stage: GenerationStage, percentage: number) => void;
  getImageUrl?: (url: string) => string;
}

const GeneratedImageGallery = React.forwardRef<HTMLDivElement, GeneratedImageGalleryProps>(({
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
  onStageChange,
  getImageUrl
}, ref) => {
  const router = useRouter();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [errorImages, setErrorImages] = useState<Record<string, boolean>>({});
  const [visibleCount, setVisibleCount] = useState<number>(MAX_VISIBLE_IMAGES);
  const [activeImagesSet, setActiveImagesSet] = useState<Set<string>>(new Set());
  const [imageProxyMap, setImageProxyMap] = useState<Record<string, string>>({});
  
  // 使用自定义钩子获取图片处理函数
  const { getImageUrl: defaultGetImageUrl } = useImageHandling();
  const resolveImageUrl = getImageUrl || defaultGetImageUrl;
  
  const gridRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // 监听图片代理成功事件
  useEffect(() => {
    const handleImageProxySuccess = (event: Event) => {
      const customEvent = event as CustomEvent<{originalUrl: string, proxyUrl: string}>;
      if (customEvent.detail) {
        const { originalUrl, proxyUrl } = customEvent.detail;
        
        // 更新代理图片映射
        setImageProxyMap(prev => ({
          ...prev,
          [originalUrl]: proxyUrl
        }));
        
        // 触发重新渲染
        setLoadedImages(prev => ({
          ...prev,
          [originalUrl]: true
        }));
      }
    };
    
    document.addEventListener('imageProxySuccess', handleImageProxySuccess);
    
    return () => {
      document.removeEventListener('imageProxySuccess', handleImageProxySuccess);
    };
  }, []);
  
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
  
  // 处理加载更多图片 - 使用防抖
  const handleLoadMore = useCallback(debounce(() => {
    setVisibleCount(prevCount => prevCount + MAX_VISIBLE_IMAGES);
  }, SCROLL_DEBOUNCE_TIME), []);
  
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
      { threshold: 0.1, rootMargin: "200px" }
    );
    
    observerRef.current.observe(loadMoreRef.current);
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isLoading, images.length, visibleCount, handleLoadMore]);
  
  // 优化：图片可见性监控
  useEffect(() => {
    // 创建新的交叉观察器，专门用于跟踪每个图片是否可见
    const imageObserver = new IntersectionObserver(
      (entries) => {
        const newActiveImages = new Set(activeImagesSet);
        
        entries.forEach(entry => {
          const imageUrl = entry.target.getAttribute('data-image-url');
          if (!imageUrl) return;
          
          if (entry.isIntersecting) {
            newActiveImages.add(imageUrl);
          } else {
            // 仅当图片已不在视口，且已加载过时才从活动集合中移除
            if (loadedImages[imageUrl]) {
              newActiveImages.delete(imageUrl);
            }
          }
        });
        
        setActiveImagesSet(newActiveImages);
      },
      { rootMargin: "100px", threshold: 0.1 }
    );
    
    // 为所有图片容器注册观察器
    imageRefs.current.forEach((ref, url) => {
      if (ref) {
        ref.setAttribute('data-image-url', url);
        imageObserver.observe(ref);
      }
    });
    
    return () => {
      imageObserver.disconnect();
    };
  }, [displayImages, loadedImages, activeImagesSet]);
  
  // 图片列表变更时重置可见图片数量
  useEffect(() => {
    if (images.length === 0) return;
    setVisibleCount(MAX_VISIBLE_IMAGES);
    setActiveImagesSet(new Set()); // 清空活动图片集合
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
        
        // 清除代理映射
        setImageProxyMap(prev => {
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

  // 处理图片下载 - 使用支持代理的URL
  const handleDownload = useCallback((originalUrl: string) => {
    const urlToDownload = imageProxyMap[originalUrl] || resolveImageUrl(originalUrl);
    onDownloadImage(urlToDownload);
  }, [onDownloadImage, imageProxyMap, resolveImageUrl]);

  // 获取代理或原始URL的方法
  const getDisplayUrl = useCallback((originalUrl: string) => {
    // 如果存在代理映射，优先使用
    if (imageProxyMap[originalUrl]) {
      return imageProxyMap[originalUrl];
    }
    
    // 否则使用解析URL方法
    return resolveImageUrl(originalUrl);
  }, [imageProxyMap, resolveImageUrl]);

  // 构建CSS类名
  const gridClassName = isLargerSize 
    ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 relative" 
    : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 relative";

  // 基于maxRows限制计算额外的样式
  const gridStyle = maxRows ? { 
    maxHeight: maxRows === 1 ? 'auto' : `calc(${maxRows} * (100% / 4 + 1rem))`, 
    overflow: 'hidden' 
  } : {};

  // 图片容器引用回调
  const imageRefCallback = useCallback((node: HTMLDivElement | null, imageUrl: string) => {
    if (node) {
      imageRefs.current.set(imageUrl, node);
    } else {
      imageRefs.current.delete(imageUrl);
    }
  }, []);

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
              <p className="text-foreground/80 text-center">尚未生成任何图片</p>
              <p className="text-muted-foreground text-sm text-center mt-1">上传图片并选择风格开始创作</p>
            </div>
          </div>
        )}
        
        {/* 图片列表 */}
        {!isLoading && displayImages.map((imageUrl, index) => {
          const isActive = activeImagesSet.has(imageUrl);
          const isVisible = isActive || !loadedImages[imageUrl];
          const isError = errorImages[imageUrl];
          const isLoaded = loadedImages[imageUrl];
          
          // 使用代理或处理后的URL
          const displayUrl = getDisplayUrl(imageUrl);
          
          return (
            <div 
              key={imageUrl + index} 
              className="aspect-square relative bg-card/40 border border-border rounded-xl overflow-hidden shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 cursor-pointer"
              ref={node => imageRefCallback(node, imageUrl)}
              onClick={() => setPreviewImage(imageUrl)}
            >
              {isVisible && !isError && (
                <>
                  {!isLoaded && <ImageLoading />}
                  <LazyImage
                    src={displayUrl}
                    alt={`生成的图片 ${index + 1}`}
                    onImageLoad={() => handleImageLoad(imageUrl)}
                    onImageError={() => handleImageError(imageUrl)}
                    className="w-full h-full object-cover"
                  />
                </>
              )}
              
              {isError && <ImageError />}
            </div>
          );
        })}
        
        {/* 加载更多指示器 */}
        {hasMoreImages && (
          <div 
            ref={loadMoreRef}
            className="col-span-full py-6 flex justify-center"
          >
            <div className="animate-pulse flex items-center justify-center bg-card/50 p-3 rounded-xl border border-border">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="ml-2 text-sm text-foreground/70">加载更多...</span>
            </div>
          </div>
        )}
      </div>
      
      {/* 查看更多按钮，仅在有图片且隐藏按钮为false时显示 */}
      {!hideViewMoreButton && images.length > 0 && (
        <div className="mt-6 flex justify-center">
          <Button
            onClick={handleViewMore}
            variant="outline"
            className="group border-primary/40 hover:border-primary hover:bg-primary/10 shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 hover:translate-y-[-1px]"
          >
            查看全部图片历史
            <ChevronRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
          </Button>
        </div>
      )}
      
      {/* 图片预览模态框 */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full animate-scale-in" onClick={(e) => e.stopPropagation()}>
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
                <img 
                  src={getDisplayUrl(previewImage)} 
                  alt="预览图片"
                  className="max-w-full max-h-[70vh] object-contain"
                />
              </div>
              
              {/* 图片操作栏 */}
              <div className="p-4 flex justify-between items-center border-t border-border/50">
                <div className="truncate text-sm text-muted-foreground font-quicksand">
                  预览图片
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
                    onClick={() => handleDownload(previewImage)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    <span>下载</span>
                  </Button>
                  
                  {onDeleteImage && (
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
                      onClick={() => handleDeleteImage(previewImage)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      <span>删除</span>
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
});

export default GeneratedImageGallery; 