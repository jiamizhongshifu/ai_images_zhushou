"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import React from "react";

// 导入自定义hooks
import useImageHistory, { ImageHistoryItem } from "@/hooks/useImageHistory";
import useImageHandling from "@/hooks/useImageHandling";
import useNotification from "@/hooks/useNotification";
// 直接导入创作页使用的图片展示组件
import GeneratedImageGallery from "@/components/creation/generated-image-gallery";
import { ResponsiveContainer, ResponsiveSection, ResponsiveGrid } from "@/components/ui/responsive-container";

export default function HistoryPage() {
  const router = useRouter();
  
  // 状态管理
  const [error, setError] = useState("");
  const [dataChecked, setDataChecked] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const ITEMS_PER_PAGE = 12;
  
  // 使用自定义hooks
  const { images, isLoading, refetch: refreshHistory, deleteImage } = useImageHistory();
  
  const { 
    handleImageLoad, 
    handleImageError, 
    downloadImage,
  } = useImageHandling();
  
  const { showNotification } = useNotification();
  
  // 存储按页码分好组的历史记录
  const [historyItems, setHistoryItems] = useState<string[]>([]);
  
  // 刷新历史记录
  const handleRefresh = async () => {
    try {
      setError("");
      await refreshHistory(true);
    } catch (err) {
      console.error("刷新历史记录失败:", err);
      setError("获取历史记录失败，请稍后再试");
    }
  };
  
  // 初始加载和数据处理
  useEffect(() => {
    // 初始加载
    if (!dataChecked) {
      handleRefresh();
      setDataChecked(true);
    }
    
    // 计算总页数
    const total = Math.ceil(images.length / ITEMS_PER_PAGE);
    setTotalPages(total > 0 ? total : 1);
    
    // 分页显示历史记录
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    
    // 处理历史记录图片
    const paginatedImages = images.slice(startIdx, endIdx);
    const urls = paginatedImages.map(item => {
      // 检查是字符串还是对象
      if (typeof item === 'string') {
        return item;
      } else if (item && typeof item === 'object') {
        // 如果是对象，尝试获取image_url属性
        // @ts-ignore - 忽略类型错误，因为我们已经做了运行时检查
        return item.image_url || '';
      }
      return '';
    }).filter(url => url !== ''); // 过滤掉空字符串
    
    setHistoryItems(urls);
    
  }, [images, currentPage, dataChecked]);
  
  // 处理页码变化
  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    // 页面滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  // 生成页码数组
  const generatePageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    
    // 总是显示第一页
    pages.push(1);
    
    // 显示当前页码周围的2页
    const startPage = Math.max(2, currentPage - 1);
    const endPage = Math.min(totalPages - 1, currentPage + 1);
    
    // 添加省略号
    if (startPage > 2) {
      pages.push('...');
    }
    
    // 添加中间页码
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    // 添加省略号
    if (endPage < totalPages - 1) {
      pages.push('...');
    }
    
    // 添加最后一页(如果总页数大于1)
    if (totalPages > 1) {
      pages.push(totalPages);
    }
    
    return pages;
  };

  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="max-w-7xl w-full px-4 py-8">
        {/* 页面标题与说明 */}
        <div className="flex flex-col items-center mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 md:mb-3 font-quicksand bg-gradient-to-r from-primary to-primary-700 bg-clip-text text-transparent">生成历史</h1>
          <p className="text-base md:text-lg text-muted-foreground text-center max-w-2xl font-nunito">
            查看您的历史生成内容，下载或删除不需要的图片
          </p>
        </div>
        
        {/* 错误提示 */}
        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-xl mb-6 text-sm font-nunito border border-destructive/20 shadow-ghibli-sm">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              {error}
            </div>
          </div>
        )}

        {/* 图片展示区域 */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-ghibli-sm transition-all duration-300 hover:shadow-ghibli mb-6">
          <div className="flex flex-col space-y-1.5 p-6 font-quicksand">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
              <h2 className="text-xl font-bold leading-none tracking-tight font-quicksand text-foreground mb-1 sm:mb-0">我的历史图片</h2>
              <p className="text-sm text-muted-foreground">共 {images.length} 张图片，当前第 {currentPage} 页，每页显示 {ITEMS_PER_PAGE} 张</p>
            </div>
          </div>
          
          <div className="p-6 pt-0 font-nunito">
            {/* 使用现有的GeneratedImageGallery组件，确保功能一致性 */}
            <GeneratedImageGallery
              images={historyItems}
              isLoading={isLoading}
              onImageLoad={handleImageLoad}
              onImageError={handleImageError}
              onDownloadImage={downloadImage}
              onDeleteImage={deleteImage}
              hideViewMoreButton={true}
            />
          </div>
        </div>
        
        {/* 分页控制 */}
        {totalPages > 1 && (
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-2 bg-card/60 rounded-xl border border-border shadow-ghibli-sm p-2 md:p-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
                className="h-8 px-2 md:px-3 bg-background/60 hover:bg-primary/5 hover:text-primary border-border/50"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-1">
                {generatePageNumbers().map((page, index) => (
                  <React.Fragment key={index}>
                    {page === '...' ? (
                      <span className="text-muted-foreground px-2">...</span>
                    ) : (
                      <Button
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(page as number)}
                        disabled={isLoading}
                        className={`h-8 w-8 p-0 ${
                          currentPage === page 
                            ? "bg-primary text-primary-foreground shadow-ghibli-sm" 
                            : "bg-background/60 hover:bg-primary/5 hover:text-primary border-border/50"
                        }`}
                      >
                        {page}
                      </Button>
                    )}
                  </React.Fragment>
                ))}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || isLoading}
                className="h-8 px-2 md:px-3 bg-background/60 hover:bg-primary/5 hover:text-primary border-border/50"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        
        {/* 返回创作页按钮 */}
        <div className="flex justify-center">
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