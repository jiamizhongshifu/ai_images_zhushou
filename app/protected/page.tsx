"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, SendHorizontal, PlusCircle, RefreshCw, Image as ImageIcon, Loader2, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProtectedPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState("无风格");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 添加预览状态
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // 添加用户点数状态
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);
  
  // 添加历史记录状态
  const [imageHistory, setImageHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // 添加重试状态
  const [imageLoadRetries, setImageLoadRetries] = useState<{[key: string]: number}>({});
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2秒后重试
  
  // 添加生成状态跟踪
  const [generationStatus, setGenerationStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  
  // CSS动画类名引用
  const skeletonAnimationClass = "animate-shimmer relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent";
  
  // 获取用户点数
  const fetchUserCredits = async () => {
    try {
      setIsLoadingCredits(true);
      const response = await fetch('/api/credits/get');
      
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login'); // 未认证，跳转到登录页
          return;
        }
        throw new Error(`获取点数失败: HTTP ${response.status}`);
      }
      
      const data = await response.json().catch(err => {
        console.error('解析点数响应失败:', err);
        return { success: false, error: '解析响应数据失败' };
      });
      
      if (data.success) {
        setUserCredits(data.credits);
      } else {
        console.error('获取点数失败:', data.error || '未知错误');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('获取用户点数出错:', errorMessage);
    } finally {
      setIsLoadingCredits(false);
    }
  };
  
  // 获取历史记录
  const fetchImageHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await fetch('/api/history/get?limit=4');
      
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(`获取历史记录失败: HTTP ${response.status}`);
      }
      
      const data = await response.json().catch(err => {
        console.error('解析历史记录响应失败:', err);
        return { success: false, error: '解析响应数据失败' };
      });
      
      if (data.success) {
        // 直接打印历史记录，帮助调试
        console.log('获取到历史记录数据:', data.history);
        
        // 验证并处理图片URL
        const validImages = data.history
          .filter((item: any) => item.image_url)
          .map((item: any) => ({
            ...item,
            image_url: validateImageUrl(item.image_url)
          }))
          .filter((item: any) => item.image_url); // 过滤掉无效的URL
        
        console.log('处理后的有效图片数据:', validImages.length, '条');
        setImageHistory(validImages);
        
        // 如果没有手动生成的图片，从历史记录中加载
        if (generatedImages.length === 0 && validImages.length > 0) {
          console.log('从历史记录加载图片到展示区域');
          setGeneratedImages(validImages.map((item: any) => item.image_url));
        }
      } else {
        console.error('获取历史记录失败:', data.error || '未知错误');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('获取历史记录出错:', errorMessage);
    } finally {
      setIsLoadingHistory(false);
    }
  };
  
  // 增强的图片URL验证与清理
  const validateImageUrl = (url: string): string | null => {
    try {
      if (!url) return null;
      
      // 清理URL中可能出现的问题
      let cleanUrl = url;
      
      // 1. 删除URL末尾的右括号(如果没有对应的左括号)
      if (cleanUrl.endsWith(')') && !cleanUrl.includes('(')) {
        cleanUrl = cleanUrl.slice(0, -1);
      }
      
      // 2. 删除末尾的特殊字符
      cleanUrl = cleanUrl.replace(/[.,;:!?)]$/, '');
      
      // 3. 删除多余的引号
      if ((cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) || 
          (cleanUrl.startsWith("'") && cleanUrl.endsWith("'"))) {
        cleanUrl = cleanUrl.slice(1, -1);
      }
      
      // 对于filesystem.site的图片URL进行特殊处理
      if (cleanUrl.includes('filesystem.site/cdn')) {
        // 确保没有多余的括号
        cleanUrl = cleanUrl.replace(/\)+$/, '');
      }
      
      // 对于OpenAI生成的URL，进行特殊处理
      if (cleanUrl.includes('oaiusercontent.com')) {
        return cleanUrl; // 直接返回清理后的URL
      }
      
      // 尝试解析URL以验证其有效性
      try {
        const parsedUrl = new URL(cleanUrl);
        
        // 如果是相对路径，转换为绝对路径
        if (!parsedUrl.protocol) {
          return new URL(cleanUrl, window.location.origin).toString();
        }
        
        return cleanUrl;
      } catch (parseError) {
        console.warn('URL解析失败，尝试添加协议:', cleanUrl);
        
        // 尝试添加协议前缀
        if (!cleanUrl.startsWith('http')) {
          return validateImageUrl(`https://${cleanUrl}`);
        }
        
        console.error('无效的图片URL:', cleanUrl, parseError);
        return null;
      }
    } catch (error) {
      console.error('URL验证过程中出错:', url, error);
      return null;
    }
  };
  
  // 显示通知的辅助函数
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    // 颜色映射
    const colorMap = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      info: 'bg-blue-500'
    };
    
    // 图标映射
    const iconMap = {
      success: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
      </svg>`,
      error: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
      </svg>`,
      info: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1-5a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd" />
      </svg>`
    };
    
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 flex items-center p-3 rounded-md shadow-lg transform transition-transform duration-500 translate-x-full ${colorMap[type]} text-white max-w-xs z-50`;
    notification.innerHTML = `
      <div class="mr-3 flex-shrink-0">
        ${iconMap[type]}
      </div>
      <div class="text-sm mr-2">${message}</div>
      <button class="ml-auto text-white">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M5.293 5.293a1 1 0 011.414 0L10 8.586l3.293-3.293a1 1 0 111.414 1.414L11.414 10l3.293 3.293a1 1 0 01-1.414 1.414L10 11.414l-3.293 3.293a1 1 0 01-1.414-1.414L8.586 10 5.293 6.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    `;

    // 添加到文档
    document.body.appendChild(notification);
    
    // 添加关闭按钮功能
    const closeButton = notification.querySelector('button');
    closeButton?.addEventListener('click', () => {
      notification.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => {
        notification.remove();
      }, 300);
    });
    
    // 显示通知（在下一帧添加过渡动画）
    setTimeout(() => {
      notification.classList.remove('translate-x-full');
    }, 10);
    
    // 自动关闭
    setTimeout(() => {
      notification.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  };
  
  // 初始化加载
  useEffect(() => {
    fetchUserCredits();
    fetchImageHistory();
    
    // 添加检查: 如果历史加载成功但图片显示区域为空，尝试再次加载
    const checkTimer = setTimeout(() => {
      if (generatedImages.length === 0 && imageHistory.length > 0) {
        console.log('检测到历史记录未正确加载到显示区域，尝试重新加载');
        setGeneratedImages(imageHistory.map((item: any) => item.image_url));
      }
    }, 2000);
    
    return () => clearTimeout(checkTimer);
  }, []);
  
  // 处理图片上传
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      // 设置加载状态
      setError("");
      
      // 读取并显示处理后的图片
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error('处理上传图片时出错:', error);
      setError(`上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };
  
  // 生成图片
  const generateImage = async () => {
    // 检查是否有上传图片和选择风格的情况下可以不需要输入文本
    const hasUploadedImage = !!uploadedImage;
    const hasSelectedStyle = activeStyle !== "无风格";
    
    // 当没有输入提示词时，检查是否可以继续
    if (!prompt.trim() && !(hasUploadedImage && hasSelectedStyle)) {
      setError("请输入提示词，或上传图片并选择风格");
      return;
    }
    
    setError("");
    setIsGenerating(true);
    setGenerationStatus("loading");
    
    try {
      // 检查点数
      if (userCredits !== null && userCredits <= 0) {
        setError("点数不足，无法生成图片");
        setIsGenerating(false);
        setGenerationStatus("error");
        return;
      }
      
      // 创建完整提示词，包含风格
      let fullPrompt = prompt.trim();
      
      // 处理特殊风格
      if (activeStyle === "吉卜力") {
        // 如果有提示词使用提示词，否则使用默认提示
        fullPrompt = fullPrompt ? 
          `${fullPrompt}，生成转换成吉普力风格风格的图像` : 
          "生成转换成吉普力风格风格的图像";
      } else if (activeStyle !== "无风格") {
        // 其他风格处理
        fullPrompt = fullPrompt ? 
          `${fullPrompt}，风格：${activeStyle}` : 
          `生成${activeStyle}风格的图像`;
      }
      
      // 如果只有图片没有文本，使用默认提示词
      if (!fullPrompt && hasUploadedImage) {
        fullPrompt = "请分析这张图片并生成相应风格的新图像";
      }
      
      // 准备API请求数据
      const requestData = {
        prompt: fullPrompt,
        image: uploadedImage || undefined,
        style: activeStyle !== "无风格" ? activeStyle : undefined
      };
      
      // 直接调用新API端点生成图片
      const response = await fetch("/api/generate-image-direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });
      
      const data = await response.json().catch(err => {
        console.error('解析生成图片响应失败:', err);
        return { success: false, error: '解析响应数据失败' };
      });
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || `生成图片失败: HTTP ${response.status}`);
      }
      
      if (data.success && data.imageUrl) {
        console.log(`图片生成成功，URL: ${data.imageUrl}`);
        
        // 添加生成的图片到列表，避免重复添加
        setGeneratedImages(prev => {
          // 检查URL是否已存在
          if (prev.includes(data.imageUrl)) {
            return prev;
          }
          // 将新图片添加到数组开头
          return [data.imageUrl, ...prev];
        });
        
        // 重置状态
        setIsGenerating(false);
        setGenerationStatus("success");
        
        // 重新获取用户点数
        fetchUserCredits();
        
        // 重新获取历史记录
        fetchImageHistory().catch(err => {
          console.error('获取历史记录失败:', err);
        });
        
        // 显示成功通知
        showNotification('图片生成成功！', 'success');
      } else {
        throw new Error(data.error || "生成图片失败，服务器返回无效响应");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("生成图片失败:", errorMessage);
      setError(errorMessage || "生成图片时发生错误");
      setGenerationStatus("error");
      setIsGenerating(false);
      
      // 如果生成失败，刷新点数（可能已经退还）
      fetchUserCredits();
      
      // 显示错误通知
      showNotification(`生成失败: ${errorMessage}`, 'error');
    }
  };
  
  // 重置对话
  const resetConversation = () => {
    setPrompt("");
    setUploadedImage(null);
    setError("");
    setGeneratedImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  // 处理文件点击上传
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 改进下载图片和图片错误处理函数
  const downloadImage = (imageUrl: string) => {
    try {
      // 在新标签页打开图片URL
      window.open(imageUrl, '_blank');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('打开图片失败:', errorMessage);
      setError('打开图片失败，请重试');
    }
  };

  const handleImageError = (imageUrl: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      const target = e.target as HTMLImageElement;
      const currentRetries = imageLoadRetries[imageUrl] || 0;
      
      console.warn(`图片加载失败 (尝试 ${currentRetries + 1}/${MAX_RETRIES}): ${imageUrl}`);
      
      if (currentRetries < MAX_RETRIES) {
        // 更新重试次数
        setImageLoadRetries(prev => ({
          ...prev,
          [imageUrl]: currentRetries + 1
        }));
        
        // 设置占位图
        target.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3Cpath d='M50 40c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10-4.477-10-10-10zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z' fill='%239ca3af'/%3E%3Cpath d='M50 30c-11.046 0-20 8.954-20 20s8.954 20 20 20 20-8.954 20-20-8.954-20-20-20zm0 36c-8.837 0-16-7.163-16-16s7.163-16 16-16 16 7.163 16 16-7.163 16-16 16z' fill='%239ca3af'/%3E%3C/svg%3E`;
        target.classList.add('opacity-50');
        
        // 尝试清理和验证URL
        let cleanedUrl = imageUrl;
        
        // 如果URL末尾有右括号但不是有效的URL组成部分，尝试移除
        if (cleanedUrl.endsWith(')') && !cleanedUrl.includes('(')) {
          cleanedUrl = cleanedUrl.slice(0, -1);
          console.log('清理URL中的右括号:', cleanedUrl);
        }
        
        // 移除URL末尾可能的特殊字符
        if (/[.,;:!?)]$/.test(cleanedUrl)) {
          cleanedUrl = cleanedUrl.replace(/[.,;:!?)]$/, '');
          console.log('清理URL中的特殊字符:', cleanedUrl);
        }
        
        // 验证清理后的URL
        const validatedUrl = validateImageUrl(cleanedUrl);
        
        // 创建一个延时重试的定时器
        setTimeout(() => {
          try {
            if (validatedUrl && validatedUrl !== imageUrl) {
              // 如果URL需要更新，使用新的URL重试
              console.log('使用清理后的URL重试:', validatedUrl);
              target.src = validatedUrl;
              
              // 如果URL变化了，更新生成的图片数组
              if (cleanedUrl !== imageUrl) {
                setGeneratedImages(prev => 
                  prev.map(url => url === imageUrl ? cleanedUrl : url)
                );
              }
            } else {
              // 使用原始URL重试
              target.src = imageUrl;
            }
          } catch (innerError) {
            console.error('图片重试加载失败:', innerError);
          }
        }, RETRY_DELAY);
      } else {
        // 超过最大重试次数，显示永久占位图
        target.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23fee2e2'/%3E%3Cpath d='M50 40c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10-4.477-10-10-10zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z' fill='%23ef4444'/%3E%3Cpath d='M50 30c-11.046 0-20 8.954-20 20s8.954 20 20 20 20-8.954 20-20-8.954-20-20-20zm0 36c-8.837 0-16-7.163-16-16s7.163-16 16-16 16 7.163 16 16-7.163 16-16 16z' fill='%23ef4444'/%3E%3C/svg%3E`;
        target.classList.add('opacity-75');
        console.error(`图片加载失败，已达到最大重试次数: ${imageUrl}`);
        
        // 从历史记录中移除失败的图片
        setImageHistory(prev => prev.filter(item => item.image_url !== imageUrl));
        setGeneratedImages(prev => prev.filter(url => url !== imageUrl));
        
        // 尝试重新获取历史记录
        fetchImageHistory().catch(err => {
          console.error('重新获取历史记录失败:', err);
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('处理图片加载失败时出错:', errorMessage);
    }
  };

  // 改进图片加载处理函数
  const handleImageLoad = (imageUrl: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    try {
      console.log('图片加载成功:', imageUrl);
      // 移除重试记录，清理状态
      setImageLoadRetries(prev => {
        const newRetries = {...prev};
        delete newRetries[imageUrl];
        return newRetries;
      });
    } catch (error) {
      console.error('处理图片加载成功事件出错:', error);
    }
  };

  // 更新输入区下方按钮
  const renderActionButtons = () => {
    return (
      <div className="flex justify-end mt-2 gap-2">
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 text-xs text-muted-foreground" 
          title="重置对话"
          onClick={resetConversation}
          disabled={isGenerating}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          <span>重置对话</span>
        </Button>
      </div>
    );
  };

  // 更新图片生成骨架元素
  const renderGeneratingImageSkeleton = () => {
    return (
      <div className="aspect-square bg-muted rounded-md relative overflow-hidden group hover:shadow transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/70"></div>
        {/* 扫光动画效果 */}
        <div className="absolute inset-0 before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent"></div>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
          <p className="text-xs text-muted-foreground font-medium">正在生成中...</p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="max-w-7xl w-full px-4 py-8">
        {/* 页面标题 */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-20 h-20 mb-4">
            <div className="absolute inset-0 bg-primary rounded-lg flex items-center justify-center">
              <ImageIcon className="h-10 w-10 text-primary-foreground" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-full h-full bg-muted rounded-lg -z-10 transform translate-x-1 translate-y-1"></div>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">欢迎使用 ChatIMG 图像助手</h1>
          <p className="text-sm text-muted-foreground">上传图片或开始描述您想要生成的图像</p>
        </div>

        {/* 错误信息显示 */}
        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        {/* 风格选择 */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs">🎨</span>
              </div>
              选择艺术风格
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {["无风格", "宫崎骏", "吉卜力", "乐高", "皮克斯", "新海诚", "迪士尼", "自定义"].map((style) => (
                <StyleButton 
                  key={style} 
                  label={style} 
                  active={activeStyle === style}
                  onClick={() => setActiveStyle(style)} 
                />
              ))}
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <span>...</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 图片上传与输入区 */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          {/* 图片上传 */}
          <Card className="md:col-span-1 border-dashed">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center h-48 cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleUploadClick}>
              {uploadedImage ? (
                <div className="w-full h-full relative">
                  <img 
                    src={uploadedImage} 
                    alt="上传的图片" 
                    className="w-full h-full object-contain rounded-md"
                  />
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="absolute top-0 right-0 m-1 h-6 w-6 p-0" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedImage(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    &times;
                  </Button>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Upload className="text-primary h-5 w-5" />
                  </div>
                  <p className="font-medium text-sm text-foreground">点击或拖放图片</p>
                  <p className="text-xs text-muted-foreground mt-1">(支持JPEG, PNG, WebP等格式)</p>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept="image/*"
                onChange={handleImageUpload}
              />
            </CardContent>
          </Card>
          
          {/* 输入区 */}
          <div className="md:col-span-4 flex flex-col">
            <Card>
              <CardContent className="p-4">
                <textarea
                  placeholder="描述你想要的图像，或给出编辑指令..."
                  className="w-full px-3 py-2 bg-background border-input rounded-md text-sm resize-none min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isGenerating}
                />
                <div className="flex items-center justify-end pt-3 border-t mt-3 border-border">
                  <div className="flex items-center gap-3">
                    <div className="text-muted-foreground text-sm">
                      <span className="font-medium">
                        {isLoadingCredits ? (
                          <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                        ) : (
                          userCredits ?? '...'
                        )}点
                      </span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" title="充值点数">
                        <PlusCircle className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button 
                      size="sm" 
                      className="h-8"
                      onClick={generateImage}
                      disabled={isGenerating || 
                        ((!prompt.trim() && !(uploadedImage && activeStyle !== "无风格"))) || 
                        (userCredits !== null && userCredits <= 0)}
                    >
                      {isGenerating ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <SendHorizontal className="mr-1 h-4 w-4" />
                      )}
                      <span>{isGenerating ? "生成中..." : "生成"}</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            {renderActionButtons()}
          </div>
        </div>
        
        {/* 图片展示区 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-medium">生成结果</CardTitle>
              {generatedImages.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  共 {generatedImages.length} 张图片
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 grid-flow-row auto-rows-max w-full overflow-y-auto max-h-[800px]">
              {isGenerating && renderGeneratingImageSkeleton()}
                      
              {/* 显示已生成的图片 */}
              {generatedImages.length > 0 ? (
                generatedImages.map((imageUrl, index) => (
                  <div 
                    key={`img-${index}-${imageUrl.substring(imageUrl.lastIndexOf('/') + 1, imageUrl.length)}`}
                    className="aspect-square bg-muted rounded-md relative overflow-hidden group hover:shadow transition-all cursor-pointer"
                    onClick={() => setPreviewImage(imageUrl)}
                  >
                    <div className="relative w-full h-full">
                      <img 
                        src={imageUrl} 
                        alt={`生成的图片 ${index + 1}`} 
                        className="w-full h-full object-cover"
                        onError={(e) => handleImageError(imageUrl, e)}
                        onLoad={(e) => handleImageLoad(imageUrl, e)}
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex justify-center items-center gap-2">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="h-7 text-xs flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadImage(imageUrl);
                          }}
                        >
                          <Download className="h-3 w-3" />
                          查看原图
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="h-7 text-xs flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(imageUrl);
                          }}
                        >
                          <ImageIcon className="h-3 w-3" />
                          预览
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : !isGenerating ? (
                // 示例图片 - 只在没有生成图片且不在生成中时显示
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="aspect-square bg-muted rounded-md relative overflow-hidden group hover:shadow transition-all">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-full h-full bg-gradient-to-br from-primary/5 to-secondary/10 flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">示例图片 {index + 1}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="text-center border-t pt-4">
            <p className="text-muted-foreground text-xs w-full">提示：尝试详细描述您想要的图像，包含更多细节可以获得更好的结果</p>
          </CardFooter>
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
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 风格按钮组件
function StyleButton({ 
  label, 
  active = false,
  onClick 
}: { 
  label: string; 
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button 
      variant={active ? "default" : "outline"} 
      size="sm"
      className="h-8"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
