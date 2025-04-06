import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, X, Download, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GeneratedImageGalleryProps {
  images: string[];
  isLoading: boolean;
  onImageLoad: (imageUrl: string) => void;
  onImageError: (imageUrl: string) => void;
  onDownloadImage: (imageUrl: string) => void;
  onDeleteImage?: (imageUrl: string) => Promise<void>;
  hideViewMoreButton?: boolean;
  isLargerSize?: boolean;
}

export default function GeneratedImageGallery({
  images,
  isLoading,
  onImageLoad,
  onImageError,
  onDownloadImage,
  onDeleteImage,
  hideViewMoreButton = false,
  isLargerSize = false
}: GeneratedImageGalleryProps) {
  const router = useRouter();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
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
      }
    } catch (error) {
      console.error("删除图片失败:", error);
    }
  };

  // 构建CSS类名
  const gridClassName = isLargerSize 
    ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 relative" 
    : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 relative";

  // 图片容器样式
  const imageContainerClassName = isLargerSize
    ? "relative aspect-square border rounded-md overflow-hidden group cursor-pointer larger-image-container"
    : "relative aspect-square border rounded-md overflow-hidden group cursor-pointer";

  // 图片sizes属性
  const imageSizes = isLargerSize
    ? "(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
    : "(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw";

  return (
    <div className="relative">
      {/* 显示图片网格或加载状态 */}
      <div className={gridClassName}>
        {/* 加载状态 */}
        {isLoading && (
          <div className={`col-span-full flex items-center justify-center py-12`}>
            <div className="flex flex-col items-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-muted-foreground text-sm">正在生成图片，请稍候...</p>
            </div>
          </div>
        )}
        
        {/* 空状态 */}
        {!isLoading && images.length === 0 && (
          <div className={`col-span-full py-12 flex flex-col items-center justify-center`}>
            <p className="text-muted-foreground mb-2">暂无生成的图片</p>
            <p className="text-xs text-muted-foreground">上传照片并选择风格，开始创作</p>
          </div>
        )}
        
        {/* 图片网格 */}
        {images.map((imageUrl, index) => (
          <div
            key={`${imageUrl}-${index}`}
            className={imageContainerClassName}
            onClick={() => setPreviewImage(imageUrl)}
          >
            {/* 图片加载中状态 */}
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
            
            <Image
              src={imageUrl}
              alt={`生成的图片 ${index + 1}`}
              fill
              sizes={imageSizes}
              className="object-cover transition-all group-hover:scale-105"
              onLoad={() => onImageLoad(imageUrl)}
              onError={() => onImageError(imageUrl)}
            />
            
            {/* 图片操作按钮 - 鼠标悬停时显示 */}
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-black/20 hover:bg-black/40 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownloadImage(imageUrl);
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      
      {/* 查看更多按钮 - 只在需要时显示 */}
      {!hideViewMoreButton && !isLoading && images.length > 0 && (
        <div className="flex justify-end mt-4">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center text-sm"
            onClick={handleViewMore}
          >
            查看更多
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
      
      {/* 图片预览模态框 */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            {/* 关闭按钮 */}
            <div className="absolute -top-12 right-0 flex justify-end">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 rounded-full bg-background/20 text-white hover:bg-background/40"
                onClick={() => setPreviewImage(null)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            {/* 图片预览 */}
            <div className="bg-card rounded-lg overflow-hidden shadow-2xl">
              <div className="relative aspect-square sm:aspect-video max-h-[80vh]">
                <Image 
                  src={previewImage} 
                  alt="预览图片" 
                  fill
                  objectFit="contain"
                  priority={true}
                />
              </div>
              
              {/* 图片操作栏 */}
              <div className="p-4 flex justify-between items-center">
                <div className="truncate text-sm text-muted-foreground">
                  预览图片
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-shrink-0"
                    onClick={() => onDownloadImage(previewImage)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    <span>下载</span>
                  </Button>
                  
                  {onDeleteImage && (
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="flex-shrink-0"
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

      {/* 添加自定义样式 */}
      <style jsx global>{`
        .larger-image-container {
          min-height: 200px;
        }
        
        @media (min-width: 640px) {
          .larger-image-container {
            min-height: 250px;
          }
        }
        
        @media (min-width: 768px) {
          .larger-image-container {
            min-height: 300px;
          }
        }
      `}</style>
    </div>
  );
} 