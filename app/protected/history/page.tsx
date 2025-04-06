"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// 导入自定义hooks
import useImageHistory, { ImageHistoryItem } from "@/hooks/useImageHistory";
import useImageHandling from "@/hooks/useImageHandling";
import useNotification from "@/hooks/useNotification";
// 直接导入创作页使用的图片展示组件
import GeneratedImageGallery from "@/components/creation/generated-image-gallery";

export default function HistoryPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [dataChecked, setDataChecked] = useState<boolean>(false);
  
  // 使用自定义hooks
  const { 
    images, 
    isLoading, 
    refetch: refreshHistory, 
    deleteImage 
  } = useImageHistory();
  const { 
    handleImageLoad, 
    handleImageError, 
    downloadImage,
    imageLoadRetries 
  } = useImageHandling();
  const { showNotification } = useNotification();
  
  // 加载图片历史记录状态
  const [historyItems, setHistoryItems] = useState<ImageHistoryItem[]>([]);
  
  // 初始化时获取图片历史数据
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('/api/history/get');
        const data = await response.json();
        
        if (data.success && Array.isArray(data.history)) {
          const validItems = data.history.filter((item: any) => item && item.image_url);
          
          // 按创建时间排序历史记录，最新的在前
          const sortedItems = [...validItems].sort((a, b) => {
            // 如果没有创建时间，默认放在末尾
            if (!a.created_at) return 1;
            if (!b.created_at) return -1;
            
            // 按时间降序排序
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          setHistoryItems(sortedItems);
          
          // 标记数据已检查
          setDataChecked(true);
        }
      } catch (error) {
        console.error('加载历史记录详情失败:', error);
        // 标记数据已检查，即使出错
        setDataChecked(true);
      }
    };
    
    fetchHistory();
  }, []);
  
  // 刷新历史记录时也刷新详情
  useEffect(() => {
    if (!isLoading && images.length > 0) {
      const fetchHistory = async () => {
        try {
          const response = await fetch('/api/history/get');
          const data = await response.json();
          
          if (data.success && Array.isArray(data.history)) {
            const validItems = data.history.filter((item: any) => item && item.image_url);
            
            // 按创建时间排序历史记录，最新的在前
            const sortedItems = [...validItems].sort((a, b) => {
              // 如果没有创建时间，默认放在末尾
              if (!a.created_at) return 1;
              if (!b.created_at) return -1;
              
              // 按时间降序排序
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            
            setHistoryItems(sortedItems);
            
            // 标记数据已检查
            setDataChecked(true);
          }
        } catch (error) {
          console.error('刷新历史记录详情失败:', error);
          // 标记数据已检查，即使出错
          setDataChecked(true);
        }
      };
      
      fetchHistory();
    }
  }, [images, isLoading]);
  
  // 加载更多历史记录
  const handleRefresh = async () => {
    try {
      // 重置数据检查状态
      setDataChecked(false);
      await refreshHistory(true, true);
      showNotification("历史记录已刷新", "success");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      showNotification("刷新历史记录失败", "error");
    }
  };

  // 添加图片加载/错误逻辑的包装函数
  const onImageLoad = (imageUrl: string) => {
    // 使用try-catch来处理可能的参数错误
    try {
      handleImageLoad(imageUrl);
    } catch (error) {
      console.error("处理图片加载事件出错:", error);
    }
  };
  
  const onImageError = (imageUrl: string) => {
    // 使用try-catch来处理可能的参数错误  
    try {
      handleImageError(imageUrl);
    } catch (error) {
      console.error("处理图片错误事件出错:", error);
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="max-w-7xl w-full px-4 py-8">
        {/* 页面标题 */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-3">历史记录</h1>
          <p className="text-lg text-muted-foreground text-center max-w-2xl">
            查看您的创作历史，管理和下载您生成的图片
          </p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4 text-sm">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              {error}
            </div>
          </div>
        )}

        {/* 与创作页完全相同的容器结构 */}
        <div className="flex flex-col gap-6">
          {/* 历史记录卡片 - 完全复制创作页的图片展示区结构 */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium flex items-center">
                  历史记录
                  {isLoading && (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin text-muted-foreground" />
                  )}
                </h3>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefresh} 
                  disabled={isLoading}
                  className="flex items-center text-sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      加载中
                    </>
                  ) : (
                    "刷新记录"
                  )}
                </Button>
              </div>

              {/* 使用与创作页完全相同的组件和结构，但包装在样式增强器中 */}
              <div className="history-enhanced-gallery">
                <GeneratedImageGallery
                  images={historyItems.map(item => item.image_url)}
                  isLoading={isLoading || !dataChecked}
                  onImageLoad={onImageLoad}
                  onImageError={onImageError}
                  onDownloadImage={downloadImage}
                  onDeleteImage={deleteImage}
                  hideViewMoreButton={true}
                />
              </div>
              
              {/* 添加自定义样式，调整图片大小但保持网格布局不变 */}
              <style jsx global>{`
                /* 保持原有网格布局不变 */
                .history-enhanced-gallery .grid {
                  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                }
                
                @media (min-width: 640px) {
                  .history-enhanced-gallery .grid {
                    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                  }
                }
                
                @media (min-width: 768px) {
                  .history-enhanced-gallery .grid {
                    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
                  }
                }
                
                /* 增大图片容器尺寸，确保刷新后依然生效 */
                .history-enhanced-gallery .aspect-square {
                  min-height: 180px !important;
                  height: auto !important;
                }
                
                @media (min-width: 640px) {
                  .history-enhanced-gallery .aspect-square {
                    min-height: 200px !important;
                  }
                }
                
                @media (min-width: 768px) {
                  .history-enhanced-gallery .aspect-square {
                    min-height: 220px !important;
                  }
                }
                
                /* 改进图片显示 - 仅针对网格中的图片，不影响预览 */
                .history-enhanced-gallery .grid img {
                  object-fit: cover !important;
                }
                
                /* 确保内容区域充分利用空间 */
                .history-enhanced-gallery > div {
                  width: 100% !important;
                }
                
                /* 确保预览模式下显示完整图片 */
                .fixed.inset-0.bg-black\/80.z-50 img {
                  object-fit: contain !important;
                }
              `}</style>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// 添加时间格式化函数
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    
    // 判断是否是有效日期
    if (isNaN(date.getTime())) {
      return "未知时间";
    }
    
    // 获取当前日期
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // 获取目标日期
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    // 格式化时间部分
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    
    // 根据日期判断返回不同的显示
    if (targetDate.getTime() === today.getTime()) {
      return `今天 ${timeStr}`;
    } else if (targetDate.getTime() === yesterday.getTime()) {
      return `昨天 ${timeStr}`;
    } else {
      // 超过昨天的显示完整日期
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day} ${timeStr}`;
    }
  } catch (error) {
    console.error("日期格式化错误:", error);
    return "未知时间";
  }
} 