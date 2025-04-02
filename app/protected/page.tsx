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
  const [apiRequestTimer, setApiRequestTimer] = useState<NodeJS.Timeout | null>(null);
  const API_TIMEOUT = 180000; // 3分钟超时
  
  // 添加任务状态管理
  const [currentTask, setCurrentTask] = useState<{
    taskId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    result_url?: string;
    error_message?: string;
    created_at: string;
  } | null>(null);
  const [pollingInterval, setPollingInterval] = useState<number>(5000); // 初始5秒轮询
  const [pollingTimer, setPollingTimer] = useState<NodeJS.Timeout | null>(null);
  const MAX_POLLING_INTERVAL = 30000; // 最大轮询间隔，30秒
  
  // 添加进度更新定时器
  const [progressUpdateTimer, setProgressUpdateTimer] = useState<NodeJS.Timeout | null>(null);
  
  // 添加时间计数器状态
  const [elapsedTimeCounter, setElapsedTimeCounter] = useState<number>(0);
  
  // 添加取消任务状态
  const [isCancelling, setIsCancelling] = useState(false);
  
  // 添加API请求加载状态
  const [apiRequestLoading, setApiRequestLoading] = useState(false);
  
  // 添加重试计数
  const [pollingRetries, setPollingRetries] = useState(0);
  
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
        throw new Error('获取点数失败');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setUserCredits(data.credits);
      } else {
        console.error('获取点数失败:', data.error);
      }
    } catch (error) {
      console.error('获取用户点数出错:', error);
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
        throw new Error('获取历史记录失败');
      }
      
      const data = await response.json();
      
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
        console.error('获取历史记录失败:', data.error);
      }
    } catch (error) {
      console.error('获取历史记录出错:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };
  
  // 更简化的图片URL验证
  const validateImageUrl = (url: string): string | null => {
    try {
      // 对于OpenAI生成的URL，进行特殊处理
      if (url.includes('oaiusercontent.com')) {
        // 不再过滤任何参数，直接返回完整URL
        return url;
      }
      
      // 检查URL是否有效
      const parsedUrl = new URL(url);
      
      // 如果是相对路径，转换为绝对路径
      if (!parsedUrl.protocol) {
        return new URL(url, window.location.origin).toString();
      }
      
      return url;
    } catch (error) {
      console.error('无效的图片URL:', url, error);
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
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1H9z" clip-rule="evenodd" />
      </svg>`
    };
    
    const notificationElement = document.createElement('div');
    notificationElement.className = `fixed top-4 right-4 ${colorMap[type]} text-white p-3 rounded-md shadow-lg z-50 animate-in fade-in slide-in-from-top`;
    notificationElement.innerHTML = `<div class="flex items-center gap-2">
      ${iconMap[type]}
      <span>${message}</span>
    </div>`;
    
    document.body.appendChild(notificationElement);
    
    // 3秒后移除通知
    setTimeout(() => {
      if (document.body.contains(notificationElement)) {
        document.body.removeChild(notificationElement);
      }
    }, 3000);
  };
  
  // 修改轮询任务状态函数
  const pollTaskStatus = async (taskId: string) => {
    console.log(`轮询任务状态: ${taskId}, 间隔: ${pollingInterval}ms`);
    
    try {
      setApiRequestLoading(true);
      const response = await fetch(`/api/generate-image/status?taskId=${taskId}`);
      const data = await response.json();
      setApiRequestLoading(false);
      
      if (data.success) {
        // 设置当前任务状态
        setCurrentTask(data.task);
        
        // 根据任务状态处理
        switch (data.task.status) {
          case 'completed':
            console.log('任务已完成:', data.task);
            
            // 任务完成，添加到生成图片列表
            if (data.task.result_url) {
              // 检查是否已经添加过这个URL，避免重复添加相同的图片
              setGeneratedImages(prev => {
                if (prev.includes(data.task.result_url)) {
                  return prev; // 如果已存在，不重复添加
                }
                return [data.task.result_url, ...prev];
              });
              
              // 使用原生通知
              showNotification("图像生成成功！新的图像已添加到结果区域", "success");
              
              setGenerationStatus("success");
              
              // 任务完成后，立即刷新任务列表以获取最新状态
              fetchPendingTasks();
            }
            
            // 停止轮询
            setPollingInterval(0);
            if (pollingTimer) {
              clearTimeout(pollingTimer);
              setPollingTimer(null);
            }
            
            // 更新UI状态 - 延迟结束生成状态，确保新图片有足够时间加载和显示
            setTimeout(() => {
              setIsGenerating(false);
            }, 500);
            setPrompt("");
            break;
            
          case 'failed':
            console.log('任务失败:', data.task);
            
            // 使用原生通知
            showNotification(data.task.error || "图像生成失败，请稍后重试", "error");
            
            setGenerationStatus("error");
            // 停止轮询
            setPollingInterval(0);
            if (pollingTimer) {
              clearTimeout(pollingTimer);
              setPollingTimer(null);
            }
            
            // 更新UI状态
            setIsGenerating(false);
            break;
            
          case 'processing':
            console.log('任务处理中:', data.task);
            // 任务仍在处理，继续轮询但逐渐增加间隔
            // 如果处理时间已经超过30秒，开始加快轮询频率以捕获结果
            const startTime = new Date(data.task.created_at).getTime();
            const currentTime = new Date().getTime();
            const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);
            
            let nextPollInterval;
            if (elapsedSeconds > 60) {
              // 60秒后，加快轮询频率以确保及时获取结果
              nextPollInterval = 3000;
            } else if (elapsedSeconds > 30) {
              // 30秒后，保持适中频率
              nextPollInterval = 5000;
            } else {
              // 逐渐增加轮询间隔，但不超过10秒
              nextPollInterval = Math.min(pollingInterval * 1.2, 10000);
            }
            
            setPollingInterval(nextPollInterval);
            setGenerationStatus("loading");
            // 设置下一次轮询
            const timer = setTimeout(() => pollTaskStatus(taskId), nextPollInterval);
            setPollingTimer(timer);
            break;
            
          case 'pending':
            console.log('任务等待中:', data.task);
            // 任务仍在等待，继续轮询但逐渐增加间隔
            setPollingInterval(Math.min(pollingInterval * 1.2, 10000));
            setGenerationStatus("loading");
            // 设置下一次轮询
            const pendingTimer = setTimeout(() => pollTaskStatus(taskId), pollingInterval);
            setPollingTimer(pendingTimer);
            break;
            
          default:
            console.log('未知任务状态:', data.task);
            setGenerationStatus("error");
            // 处理未知状态，停止轮询
            setPollingInterval(0);
            if (pollingTimer) {
              clearTimeout(pollingTimer);
              setPollingTimer(null);
            }
            break;
        }
      } else {
        console.error('获取任务状态失败:', data.error);
        setGenerationStatus("error");
        
        // 处理错误，停止轮询
        setPollingInterval(0);
        if (pollingTimer) {
          clearTimeout(pollingTimer);
          setPollingTimer(null);
        }
        
        // 更新UI状态
        setIsGenerating(false);
      }
    } catch (error) {
      console.error('轮询任务状态出错:', error);
      setApiRequestLoading(false);
      setGenerationStatus("error");
      
      // 处理错误，但不立即停止轮询，而是重试几次
      if (pollingRetries < 3) {
        setPollingRetries(pollingRetries + 1);
        // 短暂等待后重试
        const retryTimer = setTimeout(() => pollTaskStatus(taskId), 5000);
        setPollingTimer(retryTimer);
      } else {
        // 多次重试失败后停止轮询
        setPollingInterval(0);
        if (pollingTimer) {
          clearTimeout(pollingTimer);
          setPollingTimer(null);
        }
        
        // 更新UI状态
        setIsGenerating(false);
      }
    }
  };

  // 改进获取待处理任务的函数
  const fetchPendingTasks = async () => {
    if (apiRequestLoading) return;
    
    try {
      setApiRequestLoading(true);
      const response = await fetch('/api/generate-image/pending-tasks');
      const data = await response.json();
      setApiRequestLoading(false);
      setPollingRetries(0); // 重置重试计数
      
      if (data.success) {
        console.log('待处理任务:', data.tasks.length);
        
        // 检查是否有已完成但未显示的任务
        const completedTasks = data.tasks.filter((task: any) => 
          task.status === 'completed' && task.result_url
        );
        
        if (completedTasks.length > 0) {
          console.log('发现已完成但未展示的任务:', completedTasks);
          // 添加这些已完成任务的结果到显示区域
          completedTasks.forEach((task: any) => {
            if (task.result_url) {
              setGeneratedImages(prev => {
                if (prev.includes(task.result_url)) {
                  return prev; // 避免重复
                }
                return [task.result_url, ...prev];
              });
            }
          });
        }
        
        // 查找处理中的任务
        const processingTask = data.tasks.find((task: any) => 
          task.status === 'pending' || task.status === 'processing'
        );
        
        if (processingTask) {
          console.log('发现处理中的任务:', processingTask);
          // 如果没有当前任务或当前任务与发现的处理中任务不同
          if (!currentTask || currentTask.taskId !== processingTask.taskId) {
            console.log('设置新的当前任务:', processingTask);
            setCurrentTask(processingTask);
            
            // 启动轮询
            if (!pollingTimer) {
              console.log('启动任务状态轮询');
              setIsGenerating(true);
              setPollingInterval(5000);
              const timer = setTimeout(() => pollTaskStatus(processingTask.taskId), 5000);
              setPollingTimer(timer);
            }
          }
        } else {
          // 没有处理中的任务
          if (isGenerating && (!currentTask || currentTask.status !== 'completed')) {
            console.log('没有处理中的任务，更新UI状态');
            setIsGenerating(false);
          }
        }
      } else {
        console.error('获取待处理任务失败:', data.error);
      }
    } catch (error) {
      console.error('获取待处理任务出错:', error);
      setApiRequestLoading(false);
    }
  };
  
  // 初始化加载
  useEffect(() => {
    fetchUserCredits();
    fetchImageHistory();
    fetchPendingTasks(); // 添加获取进行中任务的调用
    
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
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // 检查文件大小
    if (file.size > 5 * 1024 * 1024) {
      setError("图片大小不能超过5MB");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  // 设置进度更新器
  useEffect(() => {
    // 如果有正在处理的任务，启动进度更新定时器
    if (currentTask && (currentTask.status === 'pending' || currentTask.status === 'processing')) {
      // 清除可能存在的旧定时器
      if (progressUpdateTimer) {
        clearInterval(progressUpdateTimer);
      }
      
      // 每秒更新一次界面进度显示
      const timer = setInterval(() => {
        // 增加计数器，强制触发重新渲染
        setElapsedTimeCounter(prev => prev + 1);
      }, 1000);
      
      setProgressUpdateTimer(timer);
    } else if (progressUpdateTimer) {
      // 如果没有进行中的任务，清除定时器
      clearInterval(progressUpdateTimer);
      setProgressUpdateTimer(null);
      // 重置计数器
      setElapsedTimeCounter(0);
    }
    
    // 组件卸载时清除定时器
    return () => {
      if (progressUpdateTimer) {
        clearInterval(progressUpdateTimer);
        setProgressUpdateTimer(null);
      }
    };
  }, [currentTask]);
  
  // 清理定时器
  useEffect(() => {
    return () => {
      // 组件卸载时清除所有定时器
      if (apiRequestTimer) {
        clearTimeout(apiRequestTimer);
        setApiRequestTimer(null);
      }
      
      if (pollingTimer) {
        clearTimeout(pollingTimer);
        setPollingTimer(null);
      }
      
      if (progressUpdateTimer) {
        clearInterval(progressUpdateTimer);
        setProgressUpdateTimer(null);
      }
    };
  }, [apiRequestTimer, pollingTimer, progressUpdateTimer]);
  
  // 生成图片
  const generateImage = async () => {
    if (!prompt.trim()) {
      setError("请输入提示词");
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
      let fullPrompt = prompt;
      if (activeStyle !== "无风格") {
        fullPrompt += `，风格：${activeStyle}`;
      }
      
      // 准备API请求数据
      const requestData = {
        prompt: fullPrompt,
        image: uploadedImage || undefined,
        style: activeStyle !== "无风格" ? activeStyle : undefined
      };
      
      // 创建任务
      const response = await fetch("/api/generate-image/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "创建任务失败");
      }
      
      if (data.success && data.taskId) {
        console.log(`任务创建成功，ID: ${data.taskId}`);
        
        // 设置当前任务
        setCurrentTask({
          taskId: data.taskId,
          status: 'pending',
          created_at: new Date().toISOString()
        });
        
        // 重置轮询间隔
        setPollingInterval(5000);
        
        // 开始轮询任务状态
        const timer = setTimeout(() => pollTaskStatus(data.taskId), 5000);
        setPollingTimer(timer);
        
        // 清除任何残留的超时定时器
        if (apiRequestTimer) {
          clearTimeout(apiRequestTimer);
          setApiRequestTimer(null);
        }
      } else {
        throw new Error(data.error || "创建任务失败");
      }
    } catch (err: any) {
      console.error("生成图片失败:", err);
      setError(err.message || "生成图片时发生错误");
      setGenerationStatus("error");
      setIsGenerating(false);
      
      // 如果生成失败，刷新点数（可能已经退还）
      fetchUserCredits();
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

  // 修改下载图片函数
  const downloadImage = (imageUrl: string) => {
    try {
      // 在新标签页打开图片URL
      window.open(imageUrl, '_blank');
    } catch (error) {
      console.error('打开图片失败:', error);
      setError('打开图片失败，请重试');
    }
  };

  const handleImageError = async (imageUrl: string, e: React.SyntheticEvent<HTMLImageElement>) => {
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
      
      // 尝试重新验证URL
      const validatedUrl = validateImageUrl(imageUrl);
      if (validatedUrl && validatedUrl !== imageUrl) {
        // 如果URL需要更新，使用新的URL重试
        setTimeout(() => {
          target.src = validatedUrl;
        }, RETRY_DELAY);
      } else {
        // 使用原始URL重试
        setTimeout(() => {
          target.src = imageUrl;
        }, RETRY_DELAY);
      }
    } else {
      // 超过最大重试次数，显示永久占位图
      target.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23fee2e2'/%3E%3Cpath d='M50 40c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10-4.477-10-10-10zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z' fill='%23ef4444'/%3E%3Cpath d='M50 30c-11.046 0-20 8.954-20 20s8.954 20 20 20 20-8.954 20-20-8.954-20-20-20zm0 36c-8.837 0-16-7.163-16-16s7.163-16 16-16 16 7.163 16 16-7.163 16-16 16z' fill='%23ef4444'/%3E%3C/svg%3E`;
      target.classList.add('opacity-75');
      console.error(`图片加载失败，已达到最大重试次数: ${imageUrl}`);
      
      // 从历史记录中移除失败的图片
      setImageHistory(prev => prev.filter(item => item.image_url !== imageUrl));
      setGeneratedImages(prev => prev.filter(url => url !== imageUrl));
      
      // 尝试重新获取历史记录
      fetchImageHistory();
    }
  };

  // 添加图片加载处理函数
  const handleImageLoad = (imageUrl: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    console.log('图片加载成功:', imageUrl);
    // 移除重试记录，清理状态
    setImageLoadRetries(prev => {
      const newRetries = {...prev};
      delete newRetries[imageUrl];
      return newRetries;
    });
  };

  // 更新输入区下方按钮，添加取消选项
  const renderActionButtons = () => {
    return (
      <div className="flex justify-end mt-2 gap-2">
        {currentTask && (currentTask.status === 'pending' || currentTask.status === 'processing') && (
          <Button 
            variant="destructive" 
            size="sm" 
            className="h-7 text-xs" 
            title="取消生成"
            onClick={() => currentTask && cancelTask(currentTask.taskId)}
            disabled={!currentTask || isCancelling}
          >
            {isCancelling ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                <span>取消中...</span>
              </>
            ) : (
              <>
                <X className="h-3 w-3 mr-1" />
                <span>取消生成</span>
              </>
            )}
          </Button>
        )}
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

  // 更新任务状态显示功能
  const renderTaskStatus = () => {
    if (!currentTask || !(currentTask.status === 'pending' || currentTask.status === 'processing')) {
      return null;
    }
    
    // 计算任务已处理时间 - 使用elapsedTimeCounter强制更新
    const startTime = new Date(currentTask.created_at).getTime();
    const currentTime = new Date().getTime();
    const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);
    
    // 更精确的进度计算，基于任务状态和已经过时间
    let estimatedProgress;
    let estimatedRemainingTime;
    
    const TOTAL_ESTIMATED_TIME = 120; // 降低预计总时间，更快反馈
    
    if (currentTask.status === 'pending') {
      // 排队中状态，进度较慢
      estimatedProgress = Math.min(Math.floor((elapsedSeconds / TOTAL_ESTIMATED_TIME) * 30), 30);
      estimatedRemainingTime = TOTAL_ESTIMATED_TIME - elapsedSeconds;
    } else {
      // 处理中状态，进度更快
      // 计算基础进度：30% + 剩余65%的比例
      const baseProgress = 30;
      const processingElapsedSeconds = Math.max(0, elapsedSeconds - 5); // 假设前5秒为排队时间
      const processingProgress = Math.min(Math.floor((processingElapsedSeconds / (TOTAL_ESTIMATED_TIME - 5)) * 65), 65);
      
      estimatedProgress = baseProgress + processingProgress;
      estimatedRemainingTime = Math.max(TOTAL_ESTIMATED_TIME - elapsedSeconds, 5);
    }
    
    // 安全显示任务ID
    const displayTaskId = currentTask.taskId ? 
      `任务ID: ${currentTask.taskId.substring(0, 8)}...` : 
      '任务ID: 处理中';
    
    // 计算相对时间文本
    const timeAgoText = formatTimeAgo(new Date(currentTask.created_at), elapsedTimeCounter);
    
    // 预计完成时间
    const estimatedCompletionText = estimatedRemainingTime <= 5 ? 
      "即将完成" : 
      `预计${Math.ceil(estimatedRemainingTime / 5) * 5}秒内完成`;
    
    return (
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center text-muted-foreground">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            <span>
              任务状态: {currentTask.status === 'pending' ? '排队中' : '处理中'}
              {' '}
              ({timeAgoText})
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {displayTaskId}
          </div>
        </div>
        
        {/* 进度条 */}
        <div className="w-full bg-secondary h-1 rounded-full overflow-hidden">
          <div 
            className="bg-primary h-full rounded-full transition-all duration-300 ease-out animate-pulse"
            style={{ width: `${estimatedProgress}%` }} 
          />
        </div>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>已处理时间: {formatElapsedTime(elapsedSeconds)}</span>
          {currentTask.status === 'processing' ? (
            <span className="text-primary font-medium">图像生成中... {estimatedCompletionText}</span>
          ) : (
            <span>{estimatedCompletionText}</span>
          )}
        </div>
      </div>
    );
  };

  // 格式化已处理时间
  const formatElapsedTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // 格式化时间
  const formatTimeAgo = (date: Date, _counter?: number) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  // 添加取消任务的函数
  const cancelTask = async (taskId: string) => {
    if (!taskId) {
      console.error('取消任务失败: taskId为空');
      setError('无法取消任务，任务ID不存在');
      return;
    }
    
    // 设置取消中状态
    setIsCancelling(true);
    
    try {
      const response = await fetch("/api/generate-image/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId }),
      });
      
      // 读取响应，即使失败也要读取内容
      const data = await response.json().catch(() => ({ success: false, error: '解析响应失败' }));
      
      if (!response.ok) {
        console.error(`取消任务请求失败: HTTP ${response.status}`, data);
        throw new Error(data.error || `取消任务失败: HTTP ${response.status}`);
      }
      
      console.log(`取消任务 ${taskId} 成功:`, data);
      
      // 停止轮询
      if (pollingTimer) {
        clearTimeout(pollingTimer);
        setPollingTimer(null);
      }
      
      setIsGenerating(false);
      setGenerationStatus("idle");
      setCurrentTask(null);
      
      // 根据响应显示不同的消息
      if (data.warning) {
        // 有警告但操作成功
        setError(data.warning);
      } else if (data.creditsRefunded) {
        setError("任务已取消，点数已退还");
      } else {
        setError("任务已取消");
      }
      
      // 更新点数
      fetchUserCredits();
    } catch (error: any) {
      console.error('取消任务失败:', error);
      setError(error.message || '取消任务失败，请稍后重试');
    } finally {
      // 清除取消中状态
      setIsCancelling(false);
    }
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
              {["无风格", "宫崎骏", "乐高", "皮克斯", "新海诚", "迪士尼", "自定义"].map((style) => (
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
                      disabled={isGenerating || !prompt.trim() || (userCredits !== null && userCredits <= 0)}
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
            {renderTaskStatus()}
          </div>
        </div>
        
        {/* 图片展示区 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">生成结果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 grid-flow-row auto-rows-max w-full">
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

// 添加CSS动画
<style jsx>{`
  .skeleton-shine {
    animation: skeleton-loading 1.5s infinite;
    background-size: 200% 100%;
  }

  @keyframes skeleton-loading {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
`}</style>
