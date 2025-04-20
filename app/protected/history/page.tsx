"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { ImagePreviewModal } from "@/components/ui/image-preview-modal";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageLoading, ImageError } from "@/components/ui/loading-states";
import useImageHistory from "@/hooks/useImageHistory";
import useImageHandling from "@/hooks/useImageHandling";
import { cn } from "@/lib/utils";

// 每页显示图片数量
const ITEMS_PER_PAGE = 12;

// 防抖函数 - 避免短时间内重复调用
function debounce<T extends (...args: any[]) => any>(
  func: T, 
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

export default function HistoryPage() {
  const router = useRouter();
  const {
    images,
    historyItems,
    isLoading,
    error,
    refetch,
    deleteImage,
    loadMore,
    hasMore
  } = useImageHistory();
  
  const { getImageUrl, downloadImage } = useImageHandling();
  
  // 页面状态
  const [currentPage, setCurrentPage] = useState(1);
  const [totalImages, setTotalImages] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // 请求状态跟踪
  const isInitialLoading = useRef(false);
  const isCountLoading = useRef(false);
  const totalCountTimer = useRef<NodeJS.Timeout | null>(null);
  const initialLoadTimer = useRef<NodeJS.Timeout | null>(null);

  // 处理页面变更
  const handlePageChange = useCallback((page: number) => {
    if (page === currentPage) return;
      setPageLoading(true);
    setCurrentPage(page);
  }, [currentPage]);

  // 获取当前页图片
  const currentPageImages = (() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    return historyItems.slice(startIdx, endIdx);
  })();

  // 计算总页数
  const totalPages = Math.max(1, Math.ceil(totalImages / ITEMS_PER_PAGE));

  // 初始加载防抖保护 - 避免重复加载
  const initialLoad = useCallback(
    debounce(() => {
      if (!isInitialLoading.current) {
        isInitialLoading.current = true;
        console.log("[历史页面] 开始加载历史记录");
        
        // 设置超时，避免长时间加载
        initialLoadTimer.current = setTimeout(() => {
          if (!initialLoadComplete) {
            console.log("[历史页面] 加载超时，设置为已完成");
            setInitialLoadComplete(true);
            isInitialLoading.current = false;
          }
        }, 8000);
        
        refetch(true).then(() => {
          setInitialLoadComplete(true);
          isInitialLoading.current = false;
        });
      }
    }, 300),
    [refetch, initialLoadComplete]
  );

  // 初始加载历史数据
  useEffect(() => {
    initialLoad();
    
    // 清理函数
    return () => {
      if (initialLoadTimer.current) {
        clearTimeout(initialLoadTimer.current);
      }
      if (totalCountTimer.current) {
        clearTimeout(totalCountTimer.current);
      }
    };
  }, [initialLoad]);

  // 处理图片总数获取
  const fetchTotalCount = useCallback(
    debounce(() => {
      if (isCountLoading.current) return;
      
      isCountLoading.current = true;
      console.log("[历史页面] 获取图片总数");
      
      fetch(`/api/history/count`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setTotalImages(data.count || 0);
          } else {
            console.error("获取历史图片总数失败", data.error);
          }
        })
        .catch(err => {
          console.error("获取图片总数出错", err);
        })
        .finally(() => {
          isCountLoading.current = false;
        });
    }, 2000),
    []
  );

  // 监听图片列表变化，更新总数
  useEffect(() => {
    if (initialLoadComplete) {
      fetchTotalCount();
    }
  }, [historyItems.length, fetchTotalCount, initialLoadComplete]);

  // 更新页面加载状态
  useEffect(() => {
    if (pageLoading && !isLoading) {
      const timer = setTimeout(() => {
        setPageLoading(false);
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [pageLoading, isLoading]);

  // 处理加载新一页
  useEffect(() => {
    if (currentPage > 1 && (currentPage - 1) * ITEMS_PER_PAGE >= historyItems.length && hasMore) {
      loadMore((currentPage - 1) * ITEMS_PER_PAGE);
    }
  }, [currentPage, hasMore, historyItems.length, loadMore]);

  // 处理图片加载
  const handleImageLoad = useCallback(() => {
    // 图片加载完成后的处理（可以添加动画等）
  }, []);

  // 处理图片加载错误
  const handleImageError = useCallback(() => {
    toast.error("图片加载失败");
  }, []);

  // 删除图片
  const handleDeleteImage = useCallback(async (imageUrl: string): Promise<void> => {
    if (!imageUrl) return Promise.resolve();
    
    // 查找要删除的条目
    const targetItem = currentPageImages.find(item => item.image_url === imageUrl);
    if (!targetItem) {
      toast.error("找不到要删除的图片记录");
      return Promise.resolve();
    }

    // 添加确认弹窗
    if (!confirm("确定要删除这张图片吗？此操作不可撤销。")) {
      return Promise.resolve();
    }
    
    try {
      await deleteImage(targetItem);
      
      // 如果当前页面只有一张图片且不是第一页，则返回上一页
      if (currentPageImages.length === 1 && currentPage > 1) {
        setCurrentPage(prev => Math.max(1, prev - 1));
      }
      
      // 只在确实需要时才获取最新总数
      if (currentPageImages.length <= 1) {
        fetchTotalCount();
      } else {
        // 否则直接在本地计算新的总数，避免额外请求
        setTotalImages(prev => Math.max(0, prev - 1));
      }
      
      // 关闭预览
      setPreviewImage(null);
      
      // 显示成功提示
      toast.success("图片已删除");
    } catch (error) {
      console.error("删除图片失败:", error);
      toast.error("删除失败，请重试");
      throw error;
    }
  }, [deleteImage, currentPageImages, currentPage, fetchTotalCount]);

  // 处理刷新
  const refreshHistory = useCallback(() => {
    // 防止重复刷新
    if (isLoading) return;
    
    // 记录刷新开始状态，防止用户快速多次点击
    setPageLoading(true);
    
    toast.promise(
      refetch(true).then(() => {
        setCurrentPage(1);
        fetchTotalCount();
      })
      .finally(() => {
        setPageLoading(false);
      }),
      {
        loading: "正在刷新历史记录...",
        success: "历史记录已更新",
        error: "刷新失败，请重试"
      }
    );
  }, [refetch, fetchTotalCount, isLoading]);

  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="max-w-7xl w-full px-4 py-8">
        <div className="flex flex-col gap-8">
          {/* 标题和刷新按钮 */}
          <div className="w-full flex justify-between items-center">
            <h1 className="text-3xl font-bold font-quicksand">
              历史记录
            </h1>
            <Button
              variant="outline"
              disabled={isLoading || pageLoading}
              onClick={refreshHistory}
              className="bg-muted/50 hover:bg-muted border-none shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              刷新历史记录
            </Button>
          </div>
          
          {/* 图片网格 */}
          <div className="w-full">
            {error ? (
              <div className="w-full flex flex-col items-center justify-center py-16">
                <div className="bg-destructive/10 rounded-full p-4 mb-3">
                  <ImageIcon className="h-8 w-8 text-destructive/60" />
                </div>
                <p className="text-foreground/80 mb-2 font-quicksand text-lg">加载失败</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {error === "未授权，请登录" ? "请登录后查看历史记录" : error}
                </p>
                <Button
                  variant="default"
                  onClick={() => router.push("/protected")}
                  className="bg-primary/90 hover:bg-primary shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
                >
                  返回创作页面
                </Button>
              </div>
            ) : isLoading ? (
              <div className="w-full flex flex-col items-center justify-center py-16">
                <div className="bg-card/60 p-6 rounded-xl border border-border shadow-ghibli-sm">
                  <div className="flex flex-col items-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                    <p className="text-foreground/90 font-quicksand">正在加载历史图片...</p>
                    <p className="text-xs text-muted-foreground mt-2">请耐心等待</p>
                  </div>
                </div>
              </div>
            ) : pageLoading ? (
              <div className="w-full flex flex-col items-center justify-center py-16">
                <div className="bg-card/60 p-6 rounded-xl border border-border shadow-ghibli-sm">
                  <div className="flex flex-col items-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                    <p className="text-foreground/90 font-quicksand">正在加载第 {currentPage} 页图片...</p>
                    <p className="text-xs text-muted-foreground mt-2">请耐心等待</p>
                  </div>
                </div>
              </div>
            ) : !images.length ? (
              <div className="w-full flex flex-col items-center justify-center py-16">
                <div className="bg-muted/50 rounded-full p-4 mb-3">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
                </div>
                <p className="text-foreground/80 mb-2 font-quicksand text-lg">暂无历史图片</p>
                <p className="text-sm text-muted-foreground mb-4">您尚未生成任何图片</p>
                <Button
                  variant="default"
                  onClick={() => router.push("/protected")}
                  className="bg-primary/90 hover:bg-primary shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
                >
                  去创建图片
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {currentPageImages.map((item, index) => (
                  <div
                    key={`${item.image_url}-${index}`}
                    className="aspect-square relative overflow-hidden rounded-xl border border-border/40 cursor-pointer shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 hover:border-border/60"
                    onClick={() => setPreviewImage(item.image_url)}
                  >
                    <LazyImage
                      src={getImageUrl(item.image_url)}
                      alt={`历史图片 ${index + 1}`}
                      className="object-cover w-full h-full transition-transform duration-700 hover:scale-[1.05]"
                      onImageLoad={handleImageLoad}
                      onImageError={handleImageError}
                      fadeIn={true}
                      blurEffect={true}
                      loadingElement={
                        <div className="absolute inset-0 flex items-center justify-center bg-muted/60 backdrop-blur-sm z-10">
                          <ImageLoading message="加载中..." />
                        </div>
                      }
                      errorElement={
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/60 backdrop-blur-sm z-10">
                          <ImageError message="加载失败" />
                        </div>
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            
            {/* 分页控制组件 - 只有当totalImages大于每页数量时才显示 */}
            {totalImages > ITEMS_PER_PAGE && (
              <div className="w-full flex justify-center mt-8">
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1 || isLoading || pageLoading}
                    className="h-8 px-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="ml-1">上一页</span>
                  </Button>
                  
                  {/* 页码显示 */}
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      // 计算页码，确保当前页在中间
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                          disabled={isLoading || pageLoading}
                          className={cn(
                            "h-8 w-8 p-0",
                            currentPage === pageNum ? 'bg-primary text-primary-foreground' : ''
                          )}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages || isLoading || pageLoading}
                    className="h-8 px-2"
                  >
                    <span className="mr-1">下一页</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* 返回创作页按钮 */}
        <div className="flex justify-center mt-8">
          <Button
            variant="outline"
            onClick={() => router.push("/protected")}
            className="bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            返回创作页面
          </Button>
        </div>
      </div>

      {/* 图片预览模态框 */}
      <ImagePreviewModal
        isOpen={!!previewImage}
        imageUrl={previewImage}
        onClose={() => setPreviewImage(null)}
        onDownload={previewImage ? () => downloadImage(previewImage) : undefined}
        onDelete={previewImage ? () => handleDeleteImage(previewImage) : undefined}
      />
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