"use client";

import React, { useState } from 'react';
import Image from "next/image";
import { Calendar, Download, Trash2, MessageSquare, ExternalLink, MoreHorizontal } from "lucide-react";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/ui/status-badge";
import { ImageHistoryItem } from "@/hooks/useImageHistory";

interface HistoryImageCardProps {
  item: ImageHistoryItem;
  onDelete: (id: string) => void;
  onDownload: (url: string) => void;
  onView?: (item: ImageHistoryItem) => void;
  className?: string;
}

export default function HistoryImageCard({
  item,
  onDelete,
  onDownload,
  onView,
  className
}: HistoryImageCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  
  // 格式化日期
  const formatDate = (dateString: string): string => {
    if (!dateString) return "未知时间";
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
      });
    } catch (err) {
      return "日期格式错误";
    }
  };
  
  // 截断文本
  const truncateText = (text: string, maxLength: number): string => {
    if (!text) return "未提供描述";
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };
  
  // 处理图片加载完成
  const handleImageLoad = () => {
    setLoading(false);
  };
  
  // 处理图片加载失败
  const handleImageError = () => {
    setLoading(false);
    setLoadFailed(true);
  };
  
  // 处理删除确认
  const handleConfirmDelete = () => {
    onDelete(item.id);
    setDeleteDialogOpen(false);
  };
  
  // 图片任务状态
  const imageStatus = item.status || 'completed';

  return (
    <div className={cn(
      "relative group overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-sm transition-all duration-200 hover:shadow-md",
      className
    )}>
      {/* 图片容器 */}
      <div className="relative aspect-square overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        
        {loadFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-600">
            <MessageSquare className="w-8 h-8 mb-2" />
            <p className="text-xs">图片加载失败</p>
          </div>
        ) : (
          <Image
            src={item.image_url}
            alt={item.prompt || "生成图片"}
            fill
            className={cn(
              "object-cover transition-opacity duration-300",
              loading ? "opacity-0" : "opacity-100"
            )}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}
        
        {/* 悬停时显示的操作按钮 */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
          <Button
            size="icon"
            variant="secondary"
            className="w-8 h-8 rounded-full"
            onClick={() => onDownload(item.image_url)}
          >
            <Download className="w-4 h-4" />
          </Button>
          
          <Button
            size="icon"
            variant="secondary"
            className="w-8 h-8 rounded-full"
            onClick={() => onView && onView(item)}
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          
          <Button
            size="icon"
            variant="destructive"
            className="w-8 h-8 rounded-full"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        
        {/* 右上角状态徽章 */}
        <div className="absolute top-2 right-2 z-10">
          <StatusBadge status={imageStatus} size="sm" />
        </div>
      </div>
      
      {/* 图片信息 */}
      <div className="p-3">
        <div className="mb-2 flex items-start justify-between">
          <h3 className="text-sm font-medium line-clamp-2 text-gray-900 dark:text-gray-100">
            {truncateText(item.prompt || "无提示词", 80)}
          </h3>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDownload(item.image_url)}>
                下载图片
              </DropdownMenuItem>
              {onView && (
                <DropdownMenuItem onClick={() => onView(item)}>
                  查看大图
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-red-600 dark:text-red-400"
                onClick={() => setDeleteDialogOpen(true)}
              >
                删除图片
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
          <Calendar className="w-3 h-3 mr-1" />
          <span>{formatDate(item.created_at)}</span>
        </div>
        
        {item.style && (
          <div className="mt-1.5">
            <div className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {item.style}
            </div>
          </div>
        )}
      </div>
      
      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除这张图片吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 