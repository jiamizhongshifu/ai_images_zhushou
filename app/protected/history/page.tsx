"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Trash2, Loader2, AlertCircle, RefreshCw, Image as ImageIcon, X, ChevronDown } from "lucide-react";
import { cacheService, CACHE_PREFIXES } from "@/utils/cache-service";

// 每页加载的图片数量
const IMAGES_PER_PAGE = 20;
// 历史记录缓存时间 - 10分钟
const HISTORY_CACHE_TTL = 10 * 60 * 1000;
// 历史记录缓存键
const HISTORY_CACHE_KEY = CACHE_PREFIXES.HISTORY + ':full';

export default function HistoryPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullImageHistory, setFullImageHistory] = useState<any[]>([]); // 完整历史记录
  const [displayedImages, setDisplayedImages] = useState<any[]>([]); // 当前显示的图片
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageLoadRetries, setImageLoadRetries] = useState<{[key: string]: number}>({});
  // 添加缓存状态引用 - 避免不必要的重渲染
  const isCachedData = useRef(false);
  
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2秒后重试

  // 页面加载时获取历史记录
  useEffect(() => {
    fetchImageHistory();
    
    // 监听缓存刷新事件
    const unsubscribe = cacheService.onRefresh(HISTORY_CACHE_KEY, () => {
      console.log('[历史页面] 检测到缓存更新，刷新界面');
      // 如果当前页面是激活状态，刷新数据
      if (document.visibilityState === 'visible') {
        fetchImageHistory(false, false);
      }
    });
    
    // 页面离开时取消监听
    return () => {
      unsubscribe();
    };
  }, []);

  // 加载更多图片 - 修改防止重复
  const loadMoreImages = useCallback(() => {
    const startIndex = (currentPage - 1) * IMAGES_PER_PAGE;
    const endIndex = startIndex + IMAGES_PER_PAGE;
    
    // 取下一批图片
    const nextBatch = fullImageHistory.slice(startIndex, endIndex);
    
    // 确保不加载重复图片
    const currentImageUrls = new Set(displayedImages.map(img => img.image_url));
    const uniqueNextBatch = nextBatch.filter(item => !currentImageUrls.has(item.image_url));
    
    if (uniqueNextBatch.length > 0) {
      setDisplayedImages(prev => [...prev, ...uniqueNextBatch]);
    }
    
    setCurrentPage(prev => prev + 1);
    setHasMore(endIndex < fullImageHistory.length);
    
    console.log(`已加载 ${displayedImages.length + uniqueNextBatch.length}/${fullImageHistory.length} 张图片`);
  }, [currentPage, fullImageHistory, displayedImages]);

  // 获取历史记录 - 增加缓存支持
  const fetchImageHistory = async (forceRefresh = false, showLoading = true) => {
    // 如果要显示加载状态，才设置isLoading
    if (showLoading) {
      setIsLoading(true);
    }
    
    // 清除错误信息
    setError("");
    
    try {
      // 使用缓存服务获取数据
      const historyData = await cacheService.getOrFetch(
        HISTORY_CACHE_KEY,
        async () => {
          // 真正的API请求函数
          const response = await fetch('/api/history/get', {
            headers: {
              'Cache-Control': 'no-cache'
            }
          });
          
          if (!response.ok) {
            if (response.status === 401) {
              router.push('/sign-in');
              throw new Error('未授权，请登录');
            }
            throw new Error(`获取历史记录失败: HTTP ${response.status}`);
          }
          
          return await response.json();
        },
        {
          expiresIn: HISTORY_CACHE_TTL,
          forceRefresh // 是否强制刷新缓存
        }
      );
      
      // 标记数据来源
      isCachedData.current = !forceRefresh && cacheService.checkStatus(HISTORY_CACHE_KEY) !== 'none';
      
      if (historyData.success) {
        if (Array.isArray(historyData.history) && historyData.history.length > 0) {
          // 验证并处理图片URL
          const validImages = historyData.history
            .filter((item: any) => item && item.image_url)
            .map((item: any) => ({
              ...item,
              image_url: validateImageUrl(item.image_url)
            }))
            .filter((item: any) => item.image_url);
          
          // 确保图片URL唯一性
          const uniqueUrls = new Set();
          const uniqueImages = validImages.filter((item: {image_url: string}) => {
            if (uniqueUrls.has(item.image_url)) {
              return false;
            }
            uniqueUrls.add(item.image_url);
            return true;
          });
          
          setFullImageHistory(uniqueImages);
          
          // 重置当前页和显示的图片
          setCurrentPage(1);
          setDisplayedImages(uniqueImages.slice(0, IMAGES_PER_PAGE));
          setHasMore(uniqueImages.length > IMAGES_PER_PAGE);
          
          console.log(`[历史页面] 加载了 ${uniqueImages.length} 张历史图片 ${isCachedData.current ? '(来自缓存)' : '(来自API)'}`);
        } else {
          setFullImageHistory([]);
          setDisplayedImages([]);
          setHasMore(false);
          console.log('[历史页面] 无历史记录');
        }
      } else {
        throw new Error(historyData.error || '获取历史记录失败');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[历史页面] 获取历史记录出错:', errorMessage);
      setError(errorMessage);
      
      // 尝试从缓存获取旧数据作为降级
      const cachedData = cacheService.get<{success: boolean, history: any[]}>(HISTORY_CACHE_KEY);
      if (cachedData && !isCachedData.current) {
        console.log('[历史页面] 使用缓存数据作为降级');
        try {
          // 使用过期缓存处理数据
          const validImages = cachedData.history
            .filter((item: any) => item && item.image_url)
            .map((item: any) => ({
              ...item,
              image_url: validateImageUrl(item.image_url)
            }))
            .filter((item: any) => item.image_url);
          
          setFullImageHistory(validImages);
          setCurrentPage(1);
          setDisplayedImages(validImages.slice(0, IMAGES_PER_PAGE));
          setHasMore(validImages.length > IMAGES_PER_PAGE);
          setError(error + ' (使用缓存数据)');
        } catch (cacheError) {
          console.error('[历史页面] 处理缓存数据出错:', cacheError);
        }
      }
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
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
  const handleImageError = (e: any, imageUrl: string) => {
    try {
      console.error(`图片加载失败: ${imageUrl}`);
      
      // 更新重试次数
      setImageLoadRetries(prev => ({
        ...prev,
        [imageUrl]: (prev[imageUrl] || 0) + 1
      }));
      
      // 如果未超过最大重试次数，后续会自动重试
    } catch (error) {
      console.error('处理图片加载失败时出错:', error);
    }
  };

  // 处理图片加载成功
  const handleImageLoad = (e: any, imageUrl: string) => {
    try {
      console.log('图片加载成功:', imageUrl);
      // 移除重试记录
      setImageLoadRetries(prev => {
        const newRetries = {...prev};
        delete newRetries[imageUrl];
        return newRetries;
      });
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
      setDisplayedImages(prev => [...prev]);
    } catch (error) {
      console.error('重试加载图片失败:', error);
    }
  };

  // 删除图片 - 增加清除缓存
  const handleDeleteImage = async (imageToDelete: string) => {
    if (!confirm('确定要删除这张图片吗？删除后不可恢复。')) {
      return;
    }
    
    try {
      // 立即从UI中移除图片
      setFullImageHistory(prev => prev.filter(item => item.image_url !== imageToDelete));
      setDisplayedImages(prev => prev.filter(item => item.image_url !== imageToDelete));
      
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
      } else {
        // 删除成功后，更新缓存
        // 方法1: 强制使缓存过期，下次获取时会重新请求
        cacheService.delete(HISTORY_CACHE_KEY);
        
        // 方法2: 直接更新缓存中的数据，避免重新请求
        // const cachedData = cacheService.get(HISTORY_CACHE_KEY);
        // if (cachedData) {
        //   const updatedHistory = cachedData.history.filter(
        //     (item: any) => item.image_url !== imageToDelete
        //   );
        //   cacheService.set(HISTORY_CACHE_KEY, {
        //     ...cachedData,
        //     history: updatedHistory
        //   }, HISTORY_CACHE_TTL);
        // }
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
        <Card className="min-h-[500px]">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-medium">
                历史记录
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1"
                onClick={() => fetchImageHistory(true)}
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
              {isLoading && displayedImages.length === 0 ? (
                // 增强的加载骨架屏
                Array.from({ length: IMAGES_PER_PAGE }).map((_, index) => (
                  <div 
                    key={`skeleton-${index}`}
                    className="flex flex-col border border-border/40 rounded-xl overflow-hidden"
                  >
                    {/* 图片骨架 */}
                    <div className="aspect-square bg-muted animate-pulse rounded-t-lg"></div>
                    
                    {/* 底部信息骨架 */}
                    <div className="p-2 bg-muted flex justify-between items-center">
                      <div className="w-14 h-4 bg-muted-foreground/20 rounded animate-pulse"></div>
                      <div className="w-6 h-6 rounded bg-primary/10 animate-pulse"></div>
                    </div>
                  </div>
                ))
              ) : displayedImages.length > 0 ? (
                // 显示历史图片 - 与主页完全一致
                displayedImages.map((item, index) => (
                  <div 
                    key={`img-${index}`}
                    className="flex flex-col border border-border rounded-xl overflow-hidden"
                  >
                    {imageLoadRetries[item.image_url] && imageLoadRetries[item.image_url] > MAX_RETRIES - 1 ? (
                      <div className="h-full w-full aspect-square bg-muted animate-pulse flex flex-col items-center justify-center">
                        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                        <p className="text-xs text-muted-foreground text-center px-2">加载失败</p>
                        <p className="text-[8px] text-muted-foreground line-clamp-1 px-1 mt-1">{item.image_url.substring(0, 30)}...</p>
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
                        {/* 图片区域 - 点击直接预览 */}
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
                            onLoad={(e) => handleImageLoad(e, item.image_url)}
                            onError={(e) => handleImageError(e, item.image_url)}
                          />
                        </div>
                        
                        {/* 底部信息栏 */}
                        <div className="p-2 bg-muted flex justify-between items-center">
                          <div className="text-xs font-medium">
                            图片 {index + 1}
                          </div>
                          <div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadImage(item.image_url);
                              }}
                              className="bg-primary/10 hover:bg-primary/20 rounded p-1.5 transition-colors"
                              title="下载图片"
                            >
                              <Download className="h-4 w-4 text-primary" />
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
            
            {/* 加载更多按钮 */}
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <Button 
                  variant="outline" 
                  onClick={loadMoreImages}
                  className="gap-2"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                  <span>加载更多</span>
                </Button>
              </div>
            )}
            
            {/* 加载中状态下的加载更多骨架 */}
            {isLoading && displayedImages.length === 0 && (
              <div className="mt-6 flex justify-center">
                <div className="w-32 h-9 bg-muted rounded animate-pulse"></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 添加全局样式 */}
      <style jsx global>{`
        @keyframes skeletonWave {
          0% {
            transform: translateX(-100%);
          }
          50%, 100% {
            transform: translateX(100%);
          }
        }
        
        .skeleton-wave {
          animation: skeletonWave 1.5s infinite;
        }
      `}</style>

      {/* 图片预览模态框 - 包含删除按钮 */}
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
                <Image 
                  src={previewImage} 
                  alt="预览图片" 
                  layout="fill"
                  objectFit="contain"
                  priority={true}
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
                    <span>在新窗口打开</span>
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
                    <span>删除图片</span>
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