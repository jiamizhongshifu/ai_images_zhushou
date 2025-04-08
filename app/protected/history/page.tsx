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

// 优化参数 - 每批加载的图片数量
const ITEMS_PER_BATCH = 12;

export default function HistoryPage() {
  const router = useRouter();
  
  // 状态管理
  const [error, setError] = useState("");
  const [dataChecked, setDataChecked] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // 使用自定义hooks - 使用优化后的每批加载数量
  const { 
    images, 
    isLoading, 
    refetch: refreshHistory, 
    deleteImage,
    loadMore,
    hasMore
  } = useImageHistory(ITEMS_PER_BATCH);
  
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
      await refreshHistory(true);
    } catch (err) {
      console.error("刷新历史记录失败:", err);
      setError("获取历史记录失败，请稍后再试");
    }
  };
  
  // 处理加载更多
  const handleLoadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    try {
      await loadMore();
    } catch (err) {
      console.error("加载更多历史记录失败:", err);
      setError("加载更多图片失败，请稍后再试");
    }
  }, [isLoading, hasMore, loadMore]);
  
  // 初始加载和数据处理
  useEffect(() => {
    // 初始加载
    if (!dataChecked) {
      handleRefresh();
      setDataChecked(true);
    }
  }, [dataChecked]);
  
  // 设置交叉观察器，实现无限滚动
  useEffect(() => {
    if (!loadMoreRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isLoading && hasMore) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 } // 当10%的元素可见时触发
    );
    
    observer.observe(loadMoreRef.current);
    observerRef.current = observer;
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isLoading, hasMore, handleLoadMore]);

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
                <p className="text-sm text-muted-foreground">已加载 {images.length} 张图片</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2 text-primary hover:text-primary/80 hover:bg-primary/10"
                  onClick={handleRefresh}
                  disabled={isLoading}
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
            <GeneratedImageGallery
              images={images}
              isLoading={isLoading && images.length === 0} // 只在初始加载时显示加载状态
              onImageLoad={handleImageLoad}
              onImageError={handleImageError}
              onDownloadImage={downloadImage}
              onDeleteImage={deleteImage}
              hideViewMoreButton={true}
              isLargerSize={false}
            />
            
            {/* 加载更多指示器 */}
            {hasMore && (
              <div 
                ref={loadMoreRef}
                className={`w-full flex justify-center items-center py-8 mt-4 ${isLoading ? 'opacity-100' : 'opacity-80'}`}
              >
                {isLoading ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                    <p className="text-sm text-muted-foreground">加载更多图片...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center cursor-pointer" onClick={handleLoadMore}>
                    <ArrowDown className="h-5 w-5 text-primary mb-1" />
                    <p className="text-sm text-primary">点击加载更多</p>
                  </div>
                )}
              </div>
            )}
            
            {/* 没有更多图片提示 */}
            {!hasMore && images.length > 0 && (
              <div className="w-full text-center py-6 mt-4">
                <p className="text-sm text-muted-foreground">已加载全部图片</p>
              </div>
            )}
            
            {/* 无图片提示 */}
            {!isLoading && images.length === 0 && (
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