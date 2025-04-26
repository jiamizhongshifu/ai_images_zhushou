import React, { useState, useCallback, useRef, useEffect } from "react";
import { Loader2, X, Download, Trash2, ChevronRight, ImageIcon, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageError, ImageLoading } from "@/components/ui/loading-states";
import { useRouter } from "next/navigation";
import { ImageGenerationSkeleton, GenerationStage } from "@/components/ui/skeleton-generation";
import useImageHandling from "@/hooks/useImageHandling";
import { ImagePreviewModal } from "@/components/ui/image-preview-modal";
import { debounce } from "@/lib/utils";

// 一次性渲染的最大图片数量
const MAX_VISIBLE_IMAGES = 12;
// 滚动防抖时间（毫秒）
const SCROLL_DEBOUNCE_TIME = 300;

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
  const [lastGeneratedImage, setLastGeneratedImage] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
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
  
  // 判断是否显示骨架屏
  const shouldShowSkeleton = isGenerating || (generationStage && generationStage !== 'completed' && generationStage !== 'failed');
  
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
  
  // 监听图片生成状态变化
  useEffect(() => {
    if (!isGenerating && images.length > 0) {
      const latestImage = images[0];
      if (latestImage !== lastGeneratedImage) {
        setLastGeneratedImage(latestImage);
        setIsTransitioning(true);
        
        // 确保新图片被加载
        const img = new Image();
        img.src = resolveImageUrl(latestImage);
        img.onload = () => {
          setLoadedImages(prev => ({...prev, [latestImage]: true}));
          // 300ms后重置过渡状态，配合CSS动画
          setTimeout(() => {
            setIsTransitioning(false);
          }, 300);
        };
      }
    }
  }, [isGenerating, images, lastGeneratedImage, resolveImageUrl]);
  
  // 图片列表变更时重置可见图片数量
  useEffect(() => {
    if (images.length === 0) return;
    
    // 重置状态
    setVisibleCount(MAX_VISIBLE_IMAGES);
    setActiveImagesSet(new Set()); // 清空活动图片集合
    
    // 预加载第一张图片
    if (images[0]) {
      const img = new Image();
      img.src = resolveImageUrl(images[0]);
      img.onload = () => {
        setLoadedImages(prev => ({...prev, [images[0]]: true}));
      };
    }
  }, [images, resolveImageUrl]);
  
  // 查看更多，跳转到历史页
  const handleViewMore = () => {
    router.push("/protected/history");
  };
  
  // 处理删除图片
  const handleDeleteImage = async (imageUrl: string) => {
    if (!onDeleteImage) return;
    
    try {
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
      
      // 从活动图片集合中移除
      setActiveImagesSet(prev => {
        const newSet = new Set(prev);
        newSet.delete(imageUrl);
        return newSet;
      });
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

  // 准备网格项，骨架屏优先，然后是图片
  const prepareGridItems = () => {
    const gridItems = [];
    
    // 添加骨架屏作为第一个元素
    if (shouldShowSkeleton) {
      gridItems.push(
        <div key="generation-skeleton" className="col-span-1 animate-fade-in">
          <ImageGenerationSkeleton 
            isGenerating={isGenerating}
            stage={generationStage}
            percentage={generationPercentage}
            onStageChange={onStageChange}
            taskId={`task-${Date.now()}`}
          />
        </div>
      );
    }
    
    // 添加所有图片
    images.forEach((imageUrl, index) => {
      // 当骨架屏显示时，不显示第一个图片位置
      if (shouldShowSkeleton && index === 0) return;
      
      const isLatestImage = imageUrl === lastGeneratedImage;
      const containerClassName = `ghibli-image-container aspect-square relative overflow-hidden rounded-xl border border-border/40 cursor-pointer shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 hover:border-border/60 ${
        isLatestImage && isTransitioning ? 'animate-fade-in' : ''
      }`;

      gridItems.push(
        <div
          key={`${imageUrl}-${index}`}
          ref={(node) => imageRefCallback(node, imageUrl)}
          className={containerClassName}
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
              src={getDisplayUrl(imageUrl)}
              alt={`生成的图片 ${index + 1}`}
              className={`object-cover w-full h-full transition-transform duration-700 hover:scale-[1.05] ${
                isLatestImage ? 'animate-fade-in' : ''
              }`}
              onImageLoad={() => handleImageLoad(imageUrl)}
              onImageError={() => handleImageError(imageUrl)}
              fadeIn={true}
              blurEffect={true}
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
                handleDownload(imageUrl);
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
      );
    });
    
    return gridItems;
  };

  return (
    <div className="relative" ref={ref}>
      {/* 显示图片网格或加载状态 */}
      <div className={gridClassName} style={gridStyle}>
        {/* 加载状态 - 不影响骨架屏显示 */}
        {isLoading && !shouldShowSkeleton && (
          <div className={`col-span-full flex items-center justify-center py-14`}>
            <div className="flex flex-col items-center bg-card/60 p-6 rounded-xl border border-border shadow-ghibli-sm animate-pulse-soft">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-foreground/90 font-quicksand">正在加载图片，请稍候...</p>
            </div>
          </div>
        )}
        
        {/* 空状态 - 只在没有生成中和没有图片时显示 */}
        {!isLoading && !isGenerating && images.length === 0 && (
          <div className={`col-span-full py-14 flex flex-col items-center justify-center`}>
            <div className="bg-card/60 p-6 rounded-xl border border-border flex flex-col items-center shadow-ghibli-sm">
              <div className="bg-muted/50 rounded-full p-3 mb-3">
                <ImageIcon className="h-6 w-6 text-primary/60" />
              </div>
              <p className="text-foreground/80 mb-1.5 font-quicksand">暂无生成的图片</p>
              <p className="text-xs text-muted-foreground">上传照片并选择风格，开始创作</p>
            </div>
          </div>
        )}

        {/* 根据准备好的排列显示骨架屏+图片网格 */}
        {(!isLoading || shouldShowSkeleton) && (images.length > 0 || shouldShowSkeleton) && 
          prepareGridItems()
        }
      </div>

      {/* 查看更多按钮 */}
      {!hideViewMoreButton && images.length > 0 && (
        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={handleViewMore}
            className="ghibli-btn-outline"
          >
            <History className="mr-2 h-4 w-4" />
            查看历史记录
          </Button>
        </div>
      )}

      {/* 图片预览模态框 */}
      <ImagePreviewModal
        isOpen={!!previewImage}
        imageUrl={previewImage}
        onClose={() => setPreviewImage(null)}
        onDownload={previewImage ? () => handleDownload(previewImage) : undefined}
        onDelete={onDeleteImage && previewImage ? () => handleDeleteImage(previewImage) : undefined}
      />
    </div>
  );
});

export default GeneratedImageGallery; 