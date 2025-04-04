"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, SendHorizontal, PlusCircle, RefreshCw, Image as ImageIcon, Loader2, Download, X, AlertCircle, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import CreditRechargeDialog from "@/components/payment/credit-recharge-dialog";

// 艺术风格示例数据
const STYLE_EXAMPLES = [
  {
    id: "自定义",
    name: "自定义",
    description: "使用您的提示词自由定义风格，不应用预设效果",
    imageUrl: "/examples/custom.webp"
  },
  {
    id: "吉卜力",
    name: "吉卜力",
    description: "细腻精致、充满幻想的日式动画风格",
    imageUrl: "/examples/ghibli.webp"
  },
  {
    id: "乐高",
    name: "乐高",
    description: "积木拼搭风格，充满趣味性",
    imageUrl: "/examples/lego.webp"
  },
  {
    id: "皮克斯",
    name: "皮克斯",
    description: "3D卡通风格，生动活泼",
    imageUrl: "/examples/pixar.webp"
  },
  {
    id: "新海诚",
    name: "新海诚",
    description: "唯美光影、细腻情感表达",
    imageUrl: "/examples/shinkai.webp"
  },
  {
    id: "迪士尼",
    name: "迪士尼",
    description: "经典美式动画风格",
    imageUrl: "/examples/disney.webp"
  }
];

// 风格卡片组件
function StyleCard({ 
  style, 
  isActive = false, 
  onClick 
}: { 
  style: typeof STYLE_EXAMPLES[0];
  isActive: boolean; 
  onClick: () => void;
}) {
  return (
    <div 
      className={`relative rounded-lg overflow-hidden cursor-pointer transition-colors ${
        isActive 
          ? "shadow-[0_0_0_2px_var(--primary)] border-transparent" 
          : "border border-border hover:border-primary/50"
      }`}
      onClick={onClick}
    >
      {/* 图片预览 */}
      <div className="aspect-square bg-muted relative h-20 w-20 sm:h-22 sm:w-22">
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-muted/30 to-muted/10 z-0">
          <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
        </div>
        <img
          src={style.imageUrl || `/examples/placeholder.jpg`}
          alt={`${style.name}风格示例`}
          className="w-full h-full object-cover relative z-10"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.opacity = "0.3";
            e.currentTarget.style.zIndex = "0";
          }}
        />
        
        {/* 选中指示 */}
        {isActive && (
          <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-1 z-20">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>
      
      {/* 风格名称和描述 */}
      <div className="p-1.5 bg-card">
        <h3 className="text-xs font-medium text-center">{style.name}</h3>
      </div>
    </div>
  );
}

export default function ProtectedPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState("自定义");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 添加预览状态
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // 添加用户点数状态
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);
  
  // 添加充值弹窗状态
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);
  
  // 添加历史记录状态
  const [imageHistory, setImageHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // 添加重试状态
  const [imageLoadRetries, setImageLoadRetries] = useState<{[key: string]: number}>({});
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2秒后重试
  
  // 添加生成状态跟踪
  const [generationStatus, setGenerationStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  
  // 添加初始化状态跟踪
  const [isInitializing, setIsInitializing] = useState(true);
  
  // CSS动画类名引用
  const skeletonAnimationClass = "animate-shimmer relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent";
  
  // 添加图片比例状态
  const [imageAspectRatio, setImageAspectRatio] = useState<string | null>(null);
  const [standardAspectRatio, setStandardAspectRatio] = useState<string | null>(null);
  
  // 将任意比例转换为最接近的标准比例
  const convertToStandardRatio = (width: number, height: number): string => {
    // 计算宽高比
    const ratio = width / height;
    
    // 定义标准比例及其对应的数值
    const standardRatios = [
      { name: "16:9", value: 16/9 },
      { name: "4:3", value: 4/3 },
      { name: "3:2", value: 3/2 },
      { name: "1:1", value: 1 },
      { name: "2:3", value: 2/3 },
      { name: "3:4", value: 3/4 },
      { name: "9:16", value: 9/16 }
    ];
    
    // 找到最接近的标准比例
    let closestRatio = standardRatios[0];
    let minDiff = Math.abs(ratio - standardRatios[0].value);
    
    for (let i = 1; i < standardRatios.length; i++) {
      const diff = Math.abs(ratio - standardRatios[i].value);
      if (diff < minDiff) {
        minDiff = diff;
        closestRatio = standardRatios[i];
      }
    }
    
    console.log(`原始比例 ${width}:${height} (${ratio.toFixed(2)}) 最接近 ${closestRatio.name} (${closestRatio.value.toFixed(2)})`);
    return closestRatio.name;
  };
  
  // 初始化加载
  useEffect(() => {
    // 静默获取用户点数和历史记录，不设置loading状态
    const fetchInitialData = async () => {
      try {
        // 标记初始化正在进行
        setIsInitializing(true);
        console.log('开始初始化加载数据...');
        
        // 并行请求用户点数和历史记录
        const [creditsResponse, historyResponse] = await Promise.all([
          fetch('/api/credits/get'),
          fetch('/api/history/get')
        ]);
        
        // 处理用户点数响应
        if (creditsResponse.ok) {
          const creditsData = await creditsResponse.json();
          if (creditsData.success) {
            setUserCredits(creditsData.credits);
            console.log('成功加载用户点数:', creditsData.credits);
          }
        } else if (creditsResponse.status === 401) {
          router.push('/login');
          return;
        }
        
        let validImagesLoaded = false;
        
        // 处理历史记录响应
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          if (historyData.success) {
            console.log('初始化时获取到历史记录数据:', historyData.history?.length || 0, '条');
            
            if (Array.isArray(historyData.history) && historyData.history.length > 0) {
              // 验证并处理图片URL
              const validImages = historyData.history
                .filter((item: any) => item && item.image_url)
                .map((item: any) => ({
                  ...item,
                  image_url: validateImageUrl(item.image_url)
                }))
                .filter((item: any) => item.image_url); // 过滤掉无效的URL
              
              console.log('初始化处理后的有效图片数据:', validImages.length, '条');
              setImageHistory(validImages);
              
              // 如果有有效图片，设置到生成图片数组
              if (validImages.length > 0) {
                console.log('初始化时从历史记录加载图片到展示区域');
                // 提取图片URL数组
                const imageUrls = validImages.map((item: any) => item.image_url);
                setGeneratedImages(imageUrls);
                validImagesLoaded = true;
                console.log('成功设置', imageUrls.length, '张图片到展示区域');
              }
            } else {
              console.log('初始化时未获取到历史记录或记录为空');
            }
          } else {
            console.error('初始化时获取历史记录失败:', historyData.error || '未知错误');
          }
        } else {
          console.error('初始化时历史记录请求失败:', historyResponse.status);
        }
        
        // 等待状态更新完成再结束初始化
        // 使用短暂延时确保状态已更新
        setTimeout(() => {
          setIsInitializing(false);
          console.log('初始化加载完成, 图片加载状态:', validImagesLoaded ? '成功' : '无图片');
        }, 500);
      } catch (error) {
        console.error('初始化加载数据失败:', error);
        // 静默失败，不显示错误给用户
        setIsInitializing(false);
      }
    };
    
    fetchInitialData();
  }, [router]);
  
  // 获取用户点数 - 用于主动刷新时显示loading状态
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
  
  // 增强fetchImageHistory处理函数
  const fetchImageHistory = async () => {
    try {
      console.log('开始获取历史记录');
      
      // 设置加载状态
      setIsLoadingHistory(true);
      
      // 确保不是服务端渲染
      if (typeof window === 'undefined') {
        console.log('服务端渲染，跳过获取历史记录');
        setIsLoadingHistory(false);
        return;
      }
      
      // 强制清空重试计数
      setImageLoadRetries({});
      
      const response = await fetch('/api/history/get');
      
      if (!response.ok) {
        if (response.status === 401) {
          console.log('未授权，跳转到登录页');
          router.push('/login');
          return;
        }
        throw new Error(`获取历史记录失败: HTTP ${response.status}`);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (err) {
        console.error('解析历史记录响应失败:', err);
        throw new Error('解析响应数据失败');
      }
      
      if (data.success) {
        // 直接打印历史记录，帮助调试
        console.log('获取到历史记录数据:', data.history.length, '条');
        
        if (!Array.isArray(data.history)) {
          console.error('历史记录不是数组格式:', data.history);
          setIsLoadingHistory(false);
          return;
        }
        
        if (data.history.length === 0) {
          console.log('历史记录为空');
          setImageHistory([]);
          setIsLoadingHistory(false);
          return;
        }
        
        // 验证并处理图片URL
        const validImages = data.history
          .filter((item: any) => item && item.image_url)
          .map((item: any) => ({
            ...item,
            image_url: validateImageUrl(item.image_url)
          }))
          .filter((item: any) => item.image_url); // 过滤掉无效的URL
        
        console.log('处理后的有效图片数据:', validImages.length, '条');
        
        // 先更新历史记录状态
        setImageHistory(validImages);
        
        // 确保有历史记录时更新生成图片状态
        if (validImages.length > 0) {
          console.log('从历史记录加载图片到展示区域');
          const imageUrls = validImages.map((item: any) => item.image_url);
          
          // 防止出现重复URL
          const uniqueUrls = Array.from(new Set(imageUrls)) as string[];
          console.log('处理后的唯一URL数量:', uniqueUrls.length);
          
          // 清空当前重试记录
          setImageLoadRetries({});
          
          // 设置生成图片状态
          setGeneratedImages(uniqueUrls);
          console.log('成功设置历史图片到展示区');
        } else {
          console.warn('处理后没有有效的图片URL');
        }
      } else {
        console.error('获取历史记录失败:', data.error || '未知错误');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('获取历史记录出错:', errorMessage);
    } finally {
      // 短延时确保DOM更新
      setTimeout(() => {
      setIsLoadingHistory(false);
        console.log('历史记录加载完成');
      }, 500);
    }
  };
  
  // 增强的图片URL验证与清理
  const validateImageUrl = (url: string): string | null => {
    if (!url) return null;
    
    try {
      // 1. 清理URL中的问题
      let cleanUrl = url.trim();
      
      // 2. 检查是否是相对URL
      if (cleanUrl.startsWith('/')) {
        // 将相对URL转换为绝对URL
        cleanUrl = `${window.location.origin}${cleanUrl}`;
        console.log('转换相对URL为绝对URL:', cleanUrl);
        return cleanUrl;
      }
      
      // 3. 检查URL是否包含http协议
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        console.log('URL缺少协议，添加https://', cleanUrl);
        cleanUrl = `https://${cleanUrl}`;
      }
      
      // 4. 清理URL末尾的特殊字符和引号
      cleanUrl = cleanUrl.replace(/[.,;:!?)"']+$/, '');
      
      // 5. 移除两端的引号
      if ((cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) || 
          (cleanUrl.startsWith("'") && cleanUrl.endsWith("'"))) {
        cleanUrl = cleanUrl.slice(1, -1);
      }
      
      // 6. 特殊处理常见的图片服务源
      // filesystem.site的图片URL特殊处理
      if (cleanUrl.includes('filesystem.site')) {
        // 确保没有多余的括号
        cleanUrl = cleanUrl.replace(/\)+$/, '');
      }
      
      // 7. 验证是否为合法URL
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
        const dataUrl = event.target?.result as string;
        setUploadedImage(dataUrl);
        
        // 创建Image对象以获取图片的宽高
        const img = new (window.Image || Image)();
        img.onload = () => {
          const width = img.width;
          const height = img.height;
          const ratio = `${width}:${height}`;
          console.log(`检测到上传图片比例: ${ratio}`);
          setImageAspectRatio(ratio);
          
          // 计算并设置标准比例
          const standardRatio = convertToStandardRatio(width, height);
          setStandardAspectRatio(standardRatio);
          console.log(`标准化为: ${standardRatio}`);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error('处理上传图片时出错:', error);
      setError(`上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };
  
  // 生成图片
  const generateImage = async () => {
    // 检查是否有上传图片和选择风格
    const hasUploadedImage = !!uploadedImage;
    // 自定义风格需要提示词
    const needsPrompt = activeStyle === "自定义";
    
    // 当没有输入提示词时，检查是否可以继续
    if (!prompt.trim() && (needsPrompt || !hasUploadedImage)) {
      setError("请输入提示词，或上传图片并选择艺术风格");
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
      
      // 如果是自定义风格，直接使用用户输入的提示词
      if (activeStyle === "自定义") {
        fullPrompt = fullPrompt || "生成图像";
      } else if (activeStyle === "吉卜力") {
        // 处理特殊风格
        fullPrompt = fullPrompt ? 
          `${fullPrompt}，生成转换成吉普力风格风格的图像` : 
          "生成转换成吉普力风格风格的图像";
      } else {
        // 其他风格处理
        fullPrompt = fullPrompt ? 
          `${fullPrompt}，风格：${activeStyle}` : 
          `生成${activeStyle}风格的图像`;
      }
      
      // 准备API请求数据
      const requestData = {
        prompt: fullPrompt,
        image: uploadedImage || undefined,
        style: activeStyle !== "自定义" ? activeStyle : undefined,
        aspectRatio: imageAspectRatio,
        standardAspectRatio: standardAspectRatio
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
        
      // 如果未超过最大重试次数，尝试清理和验证URL
      if (currentRetries < MAX_RETRIES) {
        // 延时后重试
        setTimeout(() => {
          if (target && document.body.contains(target)) {
            console.log(`尝试重新加载图片 (${currentRetries + 1}/${MAX_RETRIES}): ${imageUrl}`);
              target.src = imageUrl;
            }
        }, RETRY_DELAY * (currentRetries + 1)); // 递增重试延迟
      } else {
        // 超过最大重试次数，显示永久失败状态
        console.error(`图片加载失败，已达到最大重试次数: ${imageUrl}`);
      }
    } catch (error) {
      console.error('处理图片加载失败时出错:', error);
    }
  };

  // 改进图片加载处理函数
  const handleImageLoad = (imageUrl: string, e: React.SyntheticEvent<HTMLImageElement> | undefined) => {
    try {
      console.log('图片加载成功:', imageUrl);
      // 移除重试记录，清理状态
      setImageLoadRetries(prev => {
        const newRetries = {...prev};
        delete newRetries[imageUrl];
        return newRetries;
      });
      
      // 如果有事件对象，设置图片样式
      if (e && e.target) {
        const target = e.target as HTMLImageElement;
        target.classList.remove('opacity-50');
        target.classList.add('opacity-100');
      }
    } catch (error) {
      console.error('处理图片加载成功事件出错:', error);
    }
  };

  // 添加重试加载图片函数
  const retryImage = (imageUrl: string) => {
    try {
      console.log('手动重试加载图片:', imageUrl);
      // 重置重试记录
      setImageLoadRetries(prev => ({
        ...prev,
        [imageUrl]: 0
      }));
      
      // 强制刷新状态，触发重新渲染
      setGeneratedImages(prev => [...prev]);
    } catch (error) {
      console.error('重试加载图片失败:', error);
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

  // 改进删除图片的处理逻辑
  const handleDeleteImage = async (imageToDelete: string) => {
    // 确认是否删除
    if (!confirm('确定要删除这张图片吗？删除后不可恢复。')) {
            return;
          }
          
    try {
      console.log('开始删除图片:', imageToDelete);
      
      // 立即从UI中移除图片，提供即时反馈
      setGeneratedImages(prevImages => prevImages.filter(img => img !== imageToDelete));
      
      // 也从历史记录中移除，确保一致性
      setImageHistory(prev => prev.filter(item => item.image_url !== imageToDelete));
      
      // 清除重试计数和任何缓存
      setImageLoadRetries(prev => {
        const newRetries = {...prev};
        delete newRetries[imageToDelete];
        return newRetries;
      });
      
      // 调用强化的删除API
      const response = await fetch('/api/history/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store'
        },
        body: JSON.stringify({ 
          imageUrl: imageToDelete,
          timestamp: new Date().getTime() // 添加时间戳避免缓存
        })
      });
      
      const result = await response.json();
      console.log('删除结果:', result);

      if (!response.ok) {
        console.error('删除请求失败:', response.status, result.error);
      }

      // 不论结果如何，确保本地UI与删除操作保持一致
      // 图片已从UI移除，保持这个状态
      
      // 可选：在短暂延时后刷新历史记录，确保与服务器同步
      // 此步骤通常不需要，因为我们已经在本地维护了一致的状态
      setTimeout(() => {
        // 静默刷新历史记录，但不影响用户体验
        fetchImageHistory().catch(e => {
          // 忽略错误，不影响用户体验
          console.log('后台刷新历史记录时出错 (忽略):', e);
        });
      }, 2000);
      
    } catch (error) {
      console.error('删除图片处理过程中出错:', error);
      // 即使发生错误，也保持UI上已经删除的状态，提供一致的用户体验
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="max-w-7xl w-full px-4 py-8">
        {/* 页面标题 - 使用中文，去掉价格 */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-3">照片风格转换</h1>
          <p className="text-lg text-muted-foreground text-center max-w-2xl">
            将您的照片转化为魔幻风格的艺术作品，上传照片并选择风格，创造独特的视觉效果
          </p>
        </div>

        {/* 错误信息显示 */}
        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        {/* 垂直流程布局 */}
        <div className="flex flex-col gap-6">
          {/* 1. 上传区域 - 更大更醒目 */}
          <Card className="border-dashed border-2 bg-background/50">
            <CardContent className="p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-accent/30 transition-colors min-h-[280px]" onClick={handleUploadClick}>
              {uploadedImage ? (
                <div className="w-full h-full relative max-h-[280px]">
                  <img 
                    src={uploadedImage} 
                    alt="上传的图片" 
                    className="max-h-[280px] object-contain rounded-md mx-auto"
                  />
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="absolute top-0 right-0 m-1 h-7 w-7 p-0" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedImage(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Upload className="text-primary h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-medium text-foreground mb-2">拖放图片到这里</h3>
                  <p className="text-muted-foreground mb-4">或</p>
                  <Button>浏览文件</Button>
                  <p className="text-xs text-muted-foreground mt-4">支持JPG、PNG和WebP格式，最大5MB</p>
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

          {/* 2. 风格选择 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs">🎨</span>
                </div>
                选择艺术风格
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-4">
              <div className="flex flex-row gap-3 overflow-x-auto pb-2">
                {STYLE_EXAMPLES.map((style) => (
                  <StyleCard
                    key={style.id}
                    style={style}
                    isActive={activeStyle === style.id}
                    onClick={() => setActiveStyle(style.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 3. 提示词输入区 - 减小高度 */}
          <Card>
            <CardContent className="p-4">
              <textarea
                placeholder="描述你想要的图像，或给出编辑指令..."
                className="w-full px-3 py-2 bg-background border-input rounded-md text-sm resize-none min-h-[50px] focus:outline-none focus:ring-1 focus:ring-ring"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating}
              />
            </CardContent>
          </Card>

          {/* 4. 生成按钮 - 更大更醒目 */}
          <div className="mt-2">
            <Button 
              className="w-full py-6 text-lg transition-all shadow-md hover:shadow-lg" 
              onClick={generateImage}
              disabled={isGenerating || 
                ((!prompt.trim() && !(uploadedImage && activeStyle !== "自定义"))) || 
                (userCredits !== null && userCredits <= 0)}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  <span>正在生成中...</span>
                </>
              ) : (
                <>
                  <span>开始生成图片</span>
                  <SendHorizontal className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
            {userCredits !== null && userCredits <= 0 && (
              <p className="text-xs text-destructive mt-2 text-center">点数不足，请先充值</p>
            )}
          </div>

          {/* 生成的图片展示区 */}
          <Card className="mt-4">
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                {generatedImages.length > 0 ? (
                  // 显示生成的图片
                  generatedImages.map((image, index) => (
                    <div 
                      key={`img-${index}`}
                      className="flex flex-col border border-border rounded-xl overflow-hidden"
                    >
                      {imageLoadRetries[image] > MAX_RETRIES - 1 ? (
                        <div className="h-full w-full aspect-square bg-muted animate-pulse flex flex-col items-center justify-center">
                          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                          <p className="text-xs text-muted-foreground text-center px-2">加载失败</p>
                          <p className="text-[8px] text-muted-foreground line-clamp-1 px-1 mt-1">{image.substring(0, 30)}...</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="mt-2"
                            onClick={() => retryImage(image)}
                          >
                            重试
                          </Button>
                        </div>
                      ) : generationStatus === "loading" && index === 0 ? (
                        <div className="h-full aspect-square w-full bg-muted animate-pulse flex flex-col items-center justify-center">
                          <Loader2 className="h-8 w-8 text-primary animate-spin" />
                          <p className="text-xs text-muted-foreground mt-2">加载中...</p>
                        </div>
                      ) : (
                        <>
                          {/* 图片区域 - 点击直接预览 */}
                          <div 
                            className="cursor-pointer"
                            onClick={() => setPreviewImage(image)}
                          >
                            <img
                              src={image}
                              alt={`生成的图片 ${index + 1}`} 
                              className="w-full aspect-square object-cover"
                              loading="lazy"
                              crossOrigin="anonymous"
                              onLoad={(e) => handleImageLoad(image, e)}
                              onError={(e) => handleImageError(image, e)}
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
                                  downloadImage(image);
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
                ) : isInitializing || isLoadingHistory ? (
                  // 初始化加载中状态或加载历史记录中 - 显示加载中骨架屏
                  <div className="col-span-2 md:col-span-4 h-60 flex flex-col items-center justify-center text-center p-6">
                    <Loader2 className="h-6 w-6 text-primary animate-spin mb-4" />
                    <p className="text-sm text-muted-foreground">正在加载历史记录...</p>
                  </div>
                ) : !isGenerating ? (
                  // 空状态提示 - 已完成初始化且没有生成图片且不在生成中
                  <div className="col-span-2 md:col-span-4 h-60 flex flex-col items-center justify-center text-center p-6">
                    <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-medium text-foreground mb-2">还没有生成图片</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      尝试输入描述或上传图片并选择风格，点击"生成"按钮创建您的第一张AI图像
                    </p>
                  </div>
                ) : (
                  // 生成中状态 - 显示生成中骨架屏
                  <div className="col-span-2 md:col-span-4 h-60 flex flex-col items-center justify-center text-center p-6">
                    <Loader2 className="h-6 w-6 text-primary animate-spin mb-4" />
                    <p className="text-sm text-muted-foreground">
                      正在为您生成图像，请稍候...
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* 图片预览模态框 - 保持不变 */}
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
                    <span>在新窗口打开</span>
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="flex-shrink-0"
                    onClick={() => {
                      setPreviewImage(null); // 先关闭预览模态框
                      handleDeleteImage(previewImage); // 再删除图片
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
      
      {/* 充值弹窗 - 保持不变 */}
      <CreditRechargeDialog
        isOpen={showCreditRechargeDialog}
        onClose={() => setShowCreditRechargeDialog(false)}
        onSuccess={() => fetchUserCredits()}
      />
    </div>
  );
}
