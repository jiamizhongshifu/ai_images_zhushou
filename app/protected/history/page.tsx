"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, ChevronRight, ChevronLeft, ArrowDown, ImageIcon } from "lucide-react";
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

// 分页参数 - 每页显示图片数量
const ITEMS_PER_PAGE = 12;

export default function HistoryPage() {
  const router = useRouter();
  
  // 状态管理
  const [error, setError] = useState("");
  const [dataChecked, setDataChecked] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalImages, setTotalImages] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  
  // 使用自定义hooks - 使用分页加载数量
  const { 
    images, 
    isLoading, 
    refetch: refreshHistory, 
    deleteImage,
    loadMore,
    hasMore
  } = useImageHistory(ITEMS_PER_PAGE);
  
  const { 
    handleImageLoad, 
    handleImageError, 
    downloadImage,
  } = useImageHandling();
  
  const { showNotification } = useNotification();
  
  // 刷新历史记录
  const handleRefresh = async () => {
    try {
      setError("");
      setCurrentPage(1);
      await refreshHistory(true);
      
      // 获取总图片数量
      await fetchTotalCount();
    } catch (err) {
      console.error("刷新历史记录失败:", err);
      setError("获取历史记录失败，请稍后再试");
    }
  };
  
  // 获取总图片数量
  const fetchTotalCount = async () => {
    try {
      const response = await fetch('/api/history/count');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log("获取到总图片数:", data.count);
          setTotalImages(data.count);
        }
      }
    } catch (err) {
      console.error("获取图片总数失败:", err);
    }
  };
  
  // 处理分页切换
  const handlePageChange = async (pageNumber: number) => {
    if (isLoading || pageLoading) return;
    if (pageNumber < 1) return;
    
    const maxPage = Math.ceil(totalImages / ITEMS_PER_PAGE);
    if (pageNumber > maxPage) return;
    
    try {
      setPageLoading(true);
      
      // 先更新页码，让UI立即响应用户操作
      setCurrentPage(pageNumber);
      
      // 计算需要的数据偏移量 - 修复偏移量计算逻辑
      const neededOffset = (pageNumber - 1) * ITEMS_PER_PAGE;
      
      // 检查是否需要加载更多数据
      if (neededOffset >= images.length && hasMore) {
        console.log(`需要加载更多数据 - 当前页${pageNumber}，需要的偏移量${neededOffset}，当前数据长度${images.length}`);
        
        // 使用优化后的loadMore函数，直接传入需要的偏移量
        const hasMoreData = await loadMore(neededOffset);
        console.log(`加载偏移量${neededOffset}的数据结果:`, hasMoreData ? '成功' : '无更多数据');
        
        if (!hasMoreData && pageNumber > 1) {
          showNotification("第" + pageNumber + "页暂无数据");
        }
      }
      
      // 重新获取当前页的图片
      const updatedCurrentPageImages = images.slice(
        (pageNumber - 1) * ITEMS_PER_PAGE, 
        pageNumber * ITEMS_PER_PAGE
      );
      
      console.log(`页码${pageNumber}的图片数量:`, updatedCurrentPageImages.length);
      
      // 如果当前页没有图片但还有更多数据可加载，则尝试再次加载
      if (updatedCurrentPageImages.length === 0 && hasMore) {
        console.log("当前页没有图片，尝试再次加载");
        await loadMore(neededOffset);
      }
    } catch (err) {
      console.error("加载分页数据失败:", err);
      setError("加载分页数据失败，请稍后再试");
    } finally {
      setPageLoading(false);
    }
  };
  
  // 计算当前页面应该显示的图片
  const currentPageImages = images.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  
  // 当前页是否有内容可以显示
  const hasCurrentPageContent = currentPageImages.length > 0;

  // 检查当前页是否需要加载更多数据
  const needsMoreDataForCurrentPage = (currentPage - 1) * ITEMS_PER_PAGE >= images.length && hasMore;
  
  // 计算总页数 - 使用totalImages而不是images.length
  const totalPages = Math.max(1, Math.ceil(totalImages / ITEMS_PER_PAGE));
  
  // 初始加载和数据处理
  useEffect(() => {
    // 初始加载
    if (!dataChecked) {
      handleRefresh();
      setDataChecked(true);
    }
  }, [dataChecked]);
  
  // 当图片加载完成后检查总数量
  useEffect(() => {
    if (images.length > 0 && totalImages === 0) {
      fetchTotalCount();
    }
  }, [images, totalImages]);
  
  // 当图片总数变化时检查页码是否有效
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="max-w-7xl w-full px-4 py-8">
        {/* 页面标题与说明 */}
        <div className="flex flex-col items-center mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 md:mb-3 font-quicksand bg-gradient-to-r from-primary to-primary-700 bg-clip-text text-transparent">生成历史</h1>
          <p className="text-base md:text-lg text-muted-foreground text-center max-w-2xl font-nunito">
            查看您的历史生成内容，下载或删除不需要的图片
            <span className="block mt-1 text-xs text-muted-foreground">系统最多保存最近生成的100张图片</span>
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
              <div className="flex items-center">
                <p className="text-sm text-muted-foreground">
                  总共 <span className="font-semibold text-foreground">{totalImages}</span> 张图片 
                  {totalImages > 0 && (
                    <span className="ml-1">
                      (第 {currentPage}/{totalPages} 页)
                    </span>
                  )}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2 text-primary hover:text-primary/80 hover:bg-primary/10"
                  onClick={handleRefresh}
                  disabled={isLoading || pageLoading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </Button>
              </div>
            </div>
          </div>
          
          <div className="p-6 pt-0 font-nunito">
            {/* 使用现有的GeneratedImageGallery组件，确保功能一致性 */}
            {(isLoading && images.length === 0) ? (
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
            ) : currentPageImages.length > 0 ? (
              <GeneratedImageGallery
                images={currentPageImages}
                isLoading={false}
                onImageLoad={handleImageLoad}
                onImageError={handleImageError}
                onDownloadImage={downloadImage}
                onDeleteImage={deleteImage}
                hideViewMoreButton={true}
                isLargerSize={false}
              />
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
              <div className="w-full flex flex-col items-center justify-center py-16">
                <div className="bg-muted/50 rounded-full p-4 mb-3">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
                </div>
                <p className="text-foreground/80 mb-2 font-quicksand text-lg">当前页暂无图片</p>
                <p className="text-sm text-muted-foreground mb-4">请尝试其他页码或返回第一页</p>
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(1)}
                  className="bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
                >
                  返回第一页
                </Button>
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
                          className={`h-8 w-8 p-0 ${currentPage === pageNum ? 'bg-primary text-primary-foreground' : ''}`}
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