"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Trash2, Loader2, AlertCircle, RefreshCw, Image as ImageIcon, X } from "lucide-react";

export default function HistoryPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageHistory, setImageHistory] = useState<any[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageLoadRetries, setImageLoadRetries] = useState<{[key: string]: number}>({});
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2秒后重试

  // 页面加载时获取历史记录
  useEffect(() => {
    fetchImageHistory();
  }, []);

  // 获取历史记录
  const fetchImageHistory = async () => {
    try {
      setIsLoading(true);
      setError("");
      
      // 请求历史记录
      const response = await fetch('/api/history/get');
      
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/sign-in');
          return;
        }
        throw new Error(`获取历史记录失败: HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        if (Array.isArray(data.history) && data.history.length > 0) {
          // 验证并处理图片URL
          const validImages = data.history
            .filter((item: any) => item && item.image_url)
            .map((item: any) => ({
              ...item,
              image_url: validateImageUrl(item.image_url)
            }))
            .filter((item: any) => item.image_url);
          
          setImageHistory(validImages);
        } else {
          setImageHistory([]);
        }
      } else {
        throw new Error(data.error || '获取历史记录失败');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('获取历史记录出错:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 图片URL验证与清理
  const validateImageUrl = (url: string): string | null => {
    if (!url) return null;
    
    try {
      // 清理URL
      let cleanUrl = url.trim();
      
      // 处理相对URL
      if (cleanUrl.startsWith('/')) {
        cleanUrl = `${window.location.origin}${cleanUrl}`;
      }
      
      // 添加协议
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = `https://${cleanUrl}`;
      }
      
      // 移除特殊字符和引号
      cleanUrl = cleanUrl.replace(/[.,;:!?)"']+$/, '');
      
      // 移除两端的引号
      if ((cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) || 
          (cleanUrl.startsWith("'") && cleanUrl.endsWith("'"))) {
        cleanUrl = cleanUrl.slice(1, -1);
      }
      
      // 验证URL
      try {
        new URL(cleanUrl);
        return cleanUrl;
      } catch (parseError) {
        console.error('URL格式无效:', cleanUrl, parseError);
        return null;
      }
    } catch (error) {
      console.error('验证URL过程中出错:', url, error);
      return null;
    }
  };

  // 下载图片
  const downloadImage = (imageUrl: string) => {
    try {
      window.open(imageUrl, '_blank');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('打开图片失败:', errorMessage);
      setError('打开图片失败，请重试');
    }
  };

  // 处理图片错误
  const handleImageError = (imageUrl: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      console.error(`图片加载失败: ${imageUrl}`);
      const target = e.target as HTMLImageElement;
      const currentRetries = imageLoadRetries[imageUrl] || 0;
      
      // 更新重试次数
      setImageLoadRetries(prev => ({
        ...prev,
        [imageUrl]: currentRetries + 1
      }));
      
      // 设置占位图
      target.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3Cpath d='M50 30c-11.046 0-20 8.954-20 20s8.954 20 20 20 20-8.954 20-20-8.954-20-20-20z' fill='%23ef4444' fill-opacity='0.2'/%3E%3Cpath d='M45 45l10 10M55 45l-10 10' stroke='%23ef4444' stroke-width='3'/%3E%3C/svg%3E`;
      target.classList.add('opacity-50');
      
      // 如果未超过最大重试次数，尝试重载
      if (currentRetries < MAX_RETRIES) {
        setTimeout(() => {
          if (target && document.body.contains(target)) {
            console.log(`尝试重新加载图片 (${currentRetries + 1}/${MAX_RETRIES}): ${imageUrl}`);
            target.src = imageUrl;
          }
        }, RETRY_DELAY * (currentRetries + 1));
      }
    } catch (error) {
      console.error('处理图片加载失败时出错:', error);
    }
  };

  // 处理图片加载成功
  const handleImageLoad = (imageUrl: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      // 移除重试记录
      setImageLoadRetries(prev => {
        const newRetries = {...prev};
        delete newRetries[imageUrl];
        return newRetries;
      });
      
      // 设置图片样式
      if (e && e.target) {
        const target = e.target as HTMLImageElement;
        target.classList.remove('opacity-50');
        target.classList.add('opacity-100');
      }
    } catch (error) {
      console.error('处理图片加载成功事件出错:', error);
    }
  };

  // 重试加载图片
  const retryImage = (imageUrl: string) => {
    try {
      // 重置重试记录
      setImageLoadRetries(prev => ({
        ...prev,
        [imageUrl]: 0
      }));
      
      // 强制刷新状态
      setImageHistory(prev => [...prev]);
    } catch (error) {
      console.error('重试加载图片失败:', error);
    }
  };

  // 删除图片
  const handleDeleteImage = async (imageToDelete: string) => {
    if (!confirm('确定要删除这张图片吗？删除后不可恢复。')) {
      return;
    }
    
    try {
      // 立即从UI中移除图片
      setImageHistory(prevImages => prevImages.filter(item => item.image_url !== imageToDelete));
      
      // 清除重试计数
      setImageLoadRetries(prev => {
        const newRetries = {...prev};
        delete newRetries[imageToDelete];
        return newRetries;
      });
      
      // 调用删除API
      const response = await fetch('/api/history/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store'
        },
        body: JSON.stringify({ 
          imageUrl: imageToDelete,
          timestamp: new Date().getTime()
        })
      });
      
      if (!response.ok) {
        console.error('删除请求失败:', response.status);
      }
      
    } catch (error) {
      console.error('删除图片处理过程中出错:', error);
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="max-w-7xl w-full px-4 py-8">
        {/* 页面标题 */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-3">生成历史</h1>
          <p className="text-lg text-muted-foreground text-center max-w-2xl">
            查看您使用AI创作的所有图像作品
          </p>
        </div>

        {/* 错误信息显示 */}
        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        {/* 历史图片显示区 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-medium">历史记录</CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1"
                onClick={() => fetchImageHistory()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span>刷新</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
              {isLoading ? (
                // 加载中状态
                Array.from({ length: 4 }).map((_, index) => (
                  <div 
                    key={`skeleton-${index}`}
                    className="aspect-square bg-muted animate-pulse rounded-lg"
                  />
                ))
              ) : imageHistory.length > 0 ? (
                // 显示历史图片
                imageHistory.map((item, index) => (
                  <div 
                    key={`img-${index}`}
                    className="flex flex-col border border-border rounded-xl overflow-hidden"
                  >
                    {imageLoadRetries[item.image_url] && imageLoadRetries[item.image_url] > MAX_RETRIES - 1 ? (
                      <div className="h-full w-full aspect-square bg-muted animate-pulse flex flex-col items-center justify-center">
                        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                        <p className="text-xs text-muted-foreground text-center px-2">加载失败</p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => retryImage(item.image_url)}
                        >
                          重试
                        </Button>
                      </div>
                    ) : (
                      <>
                        {/* 图片区域 */}
                        <div 
                          className="cursor-pointer"
                          onClick={() => setPreviewImage(item.image_url)}
                        >
                          <img
                            src={item.image_url}
                            alt={`生成的图片 ${index + 1}`} 
                            className="w-full aspect-square object-cover"
                            loading="lazy"
                            crossOrigin="anonymous"
                            onLoad={(e) => handleImageLoad(item.image_url, e)}
                            onError={(e) => handleImageError(item.image_url, e)}
                          />
                        </div>
                        
                        {/* 底部信息栏 */}
                        <div className="p-2 bg-muted flex justify-between items-center">
                          <div className="text-xs font-medium truncate max-w-[120px]">
                            {item.created_at ? 
                              new Date(item.created_at).toLocaleString('zh-CN', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              }).replace(/\//g, '-')
                            : `图片 ${index + 1}`}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadImage(item.image_url);
                              }}
                              className="bg-primary/10 hover:bg-primary/20 rounded p-1 transition-colors"
                              title="下载图片"
                            >
                              <Download className="h-4 w-4 text-primary" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteImage(item.image_url);
                              }}
                              className="bg-destructive/10 hover:bg-destructive/20 rounded p-1 transition-colors"
                              title="删除图片"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))
              ) : (
                // 空状态
                <div className="col-span-2 md:col-span-4 h-60 flex flex-col items-center justify-center text-center p-6">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-medium text-foreground mb-2">暂无历史记录</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    您还没有生成任何图片，前往创作页面开始您的第一次AI创作
                  </p>
                  <Button 
                    className="mt-4"
                    onClick={() => router.push('/protected')}
                  >
                    去创作
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 图片预览模态框 */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh] w-full">
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
            <div className="bg-card rounded-lg overflow-hidden shadow-2xl">
              <div className="relative aspect-square sm:aspect-video max-h-[80vh]">
                <img 
                  src={previewImage} 
                  alt="预览图片" 
                  className="w-full h-full object-contain"
                  crossOrigin="anonymous"
                />
              </div>
              <div className="p-4 text-sm flex justify-between items-center">
                <div className="truncate">
                  <span className="text-muted-foreground">图片地址: </span>
                  <span className="text-xs text-muted-foreground/70 truncate max-w-xs">{previewImage}</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-shrink-0"
                    onClick={() => window.open(previewImage, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    <span>下载</span>
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="flex-shrink-0"
                    onClick={() => {
                      const currentPreview = previewImage;
                      setPreviewImage(null); // 先关闭预览
                      setTimeout(() => {
                        handleDeleteImage(currentPreview); // 再删除图片
                      }, 100);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    <span>删除</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 