"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, AlertCircle, ChevronRight, ImageIcon, Download, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { generatePromptWithStyle } from "@/app/config/styles";
import { ResponsiveContainer, ResponsiveSection, ResponsiveGrid } from "@/components/ui/responsive-container";
import { GenerationStage, ImageGenerationSkeleton } from "@/components/ui/skeleton-generation";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageLoading, ImageError } from "@/components/ui/loading-states";
import GeneratedImageGallery from "@/components/creation/generated-image-gallery";
import { ImagePreviewModal } from "@/components/ui/image-preview-modal";

// 导入创作页组件
import EnhancedImageUploader from "@/components/creation/enhanced-image-uploader";
import StyleSelector from "@/components/creation/style-selector";
import PromptInput from "@/components/creation/prompt-input";

// 导入自定义hooks
import useUserCredits from "@/hooks/useUserCredits";
import useImageHistory from "@/hooks/useImageHistory";
import useImageGeneration from "@/hooks/useImageGeneration";
import useImageHandling from "@/hooks/useImageHandling";
import useNotification from "@/hooks/useNotification";
import TaskStatusListener from "@/app/components/TaskStatusListener";
import TaskRecoveryDialog from "@/app/components/TaskRecoveryDialog";
import { PendingTask } from "@/utils/taskRecovery";
import { supabaseClient } from "@/utils/supabase-client";

// 动态导入CreditRechargeDialog组件
const CreditRechargeDialog = dynamic(
  () => import("@/components/payment/credit-recharge-dialog"),
  { ssr: false, loading: () => null }
);

// 定义生成状态的类型
type GenerationStatus = {
  isGenerating: boolean;
  generationStage?: GenerationStage;
  generationPercentage?: number;
};

export default function ProtectedPage() {
  const router = useRouter();
  const pathName = usePathname();
  
  // 状态管理
  const [prompt, setPrompt] = useState<string>("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState("自定义");
  const [showCreditRechargeDialog, setShowCreditRechargeDialog] = useState(false);
  const [error, setError] = useState("");
  
  // 添加图片比例状态
  const [imageAspectRatio, setImageAspectRatio] = useState<string | null>(null);
  const [standardAspectRatio, setStandardAspectRatio] = useState<string | null>(null);
  
  // 添加当前任务ID状态
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  
  // 积分状态
  const { credits, isLoading: isLoadingCredits, refetch: refreshCredits } = useUserCredits();
  const { showNotification } = useNotification();
  
  // 使用自定义hooks
  const { images, refetch: refreshHistory, deleteImage } = useImageHistory();
  const {
    handleImageLoad,
    handleImageError,
    retryImage,
    downloadImage,
    getImageUrl,
    imageLoadRetries
  } = useImageHandling();
  
  // 刷新图片列表函数
  const refreshImages = async () => {
    await refreshHistory();
  };
  
  // 使用图像生成钩子
  const {
    generatedImages,
    setGeneratedImages,
    isGenerating,
    error: generationError,
    generateImage,
    generationStage,
    generationPercentage,
    recoverTask,
    discardTask,
    checkPendingTask
  } = useImageGeneration(
    showNotification,
    (imageUrl) => {
      console.log(`[ProtectedPage] 图片生成任务成功回调，接收到图片URL: ${imageUrl}`);
      
      // 更新当前生成的图片
      setCurrentGeneratedImage(imageUrl);
      console.log(`[ProtectedPage] 已设置当前生成图片URL: ${imageUrl}`);
      
      // 更新生成的图片列表，但不触发历史记录刷新
      setGeneratedImages((prev) => {
        if (prev.includes(imageUrl)) {
          return prev;
        }
        return [imageUrl, ...prev];
      });
      
      // 使用Promise.all并行处理后台更新
      Promise.all([
        // 静默刷新积分
        refreshCredits(false, true).catch(err => {
          console.error('[ProtectedPage] 刷新积分失败:', err);
        }),
        // 静默刷新历史记录
        refreshHistory().catch(err => {
          console.error('[ProtectedPage] 刷新历史记录失败:', err);
        })
      ]).then(() => {
        console.log('[ProtectedPage] 后台更新完成');
      });
    }
  );
  
  // 修改任务完成回调处理函数
  const handleTaskCompleted = useCallback((imageUrl: string) => {
    console.log(`[ProtectedPage] 任务完成，收到图片URL: ${imageUrl}`);
    
    // 设置当前生成的图片
    setCurrentGeneratedImage(imageUrl);
    
    // 更新生成的图片列表，保持原有图片顺序
    if (imageUrl) {
      setGeneratedImages((prev: string[]) => {
        // 如果图片已存在，不重复添加
        if (prev.includes(imageUrl)) {
          return prev;
        }
        return [imageUrl, ...prev];
      });
  
      // 静默更新点数，不触发页面刷新
      setTimeout(() => {
        refreshCredits(false, true); // 静默强制刷新点数
      }, 2000);
    }
    
    // 清除当前任务ID
    setCurrentTaskId(null);
  }, [setGeneratedImages, refreshCredits]);
  
  // 修改生成完成状态监听，避免强制刷新历史记录
  useEffect(() => {
    if (generationStage === 'completed') {
      // 只刷新积分，不强制刷新历史记录
      const refreshTimeoutId = setTimeout(() => {
        console.log('[ProtectedPage] 生成完成后触发点数刷新，延迟执行以减少请求');
        refreshCredits(false, true); // 静默强制刷新点数
      }, 2000);
      
      return () => {
        clearTimeout(refreshTimeoutId);
      };
    }
  }, [generationStage, refreshCredits]);
  
  // 修改路由变化处理，避免不必要的刷新
  useEffect(() => {
    const handleRouteChange = async () => {
      // 只在返回创作页面时刷新，不再检查 generatedImages.length
      if (pathName === '/protected') {
        console.log('[ProtectedPage] 路由切换到创作页面，刷新图像状态');
        try {
          await refreshHistory();
          console.log('[ProtectedPage] 图像历史已刷新');
        } catch (error) {
          console.error('[ProtectedPage] 刷新图像历史时出错:', error);
          }
      }
    };
    
    // 初始加载时执行一次
    handleRouteChange();
  }, [pathName, refreshHistory]);
  
  // 修改初始同步逻辑，避免重复刷新
  useEffect(() => {
    if (images.length > 0 && generatedImages.length === 0) {
      console.log('[ProtectedPage] 初始化时从历史记录同步图片: ', images.length);
      setGeneratedImages(images);
    }
  }, [images, generatedImages.length, setGeneratedImages]);
  
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
  
  // 处理图片上传和获取尺寸
  const handleImageUpload = (dataUrl: string, width: number, height: number) => {
        setUploadedImage(dataUrl);
        
    // 计算图片尺寸比例
          const ratio = `${width}:${height}`;
    console.log(`[ProtectedPage] 检测到上传图片比例: ${ratio}, 尺寸: ${width}x${height}`);
          setImageAspectRatio(ratio);
          
          // 计算并设置标准比例
          const standardRatio = convertToStandardRatio(width, height);
          setStandardAspectRatio(standardRatio);
    console.log(`[ProtectedPage] 标准化比例为: ${standardRatio}`);
  };
  
  // 在页面挂载和卸载时清理图片缓存状态
  useEffect(() => {
    console.log('[ProtectedPage] 页面加载，准备处理图片');
    
    // 页面卸载时清理
    return () => {
      console.log('[ProtectedPage] 页面卸载，清理图片状态');
    };
  }, []);
  
  // 在已有的状态后面添加当前生成图片状态
  const [currentGeneratedImage, setCurrentGeneratedImage] = useState<string | null>(null);
  
  // 修改处理图片生成函数，重置当前生成图片
  const handleGenerateImage = async () => {
    setError(""); // 清除之前的错误
    // 清空当前生成图片状态，准备新的生成
    setCurrentGeneratedImage(null);
    
    // 记录生成参数，便于调试
    console.log('[ProtectedPage] 开始生成图片，参数：', {
      prompt: prompt,
      styleSelected: activeStyle,
      hasUploadedImage: !!uploadedImage,
      aspectRatio: imageAspectRatio,
      standardAspectRatio: standardAspectRatio
    });
    
    try {
      const taskResult = await generateImage({
        prompt,
        image: uploadedImage,
        style: activeStyle,
        aspectRatio: imageAspectRatio,
        standardAspectRatio: standardAspectRatio
      });
      
      // 保存当前任务ID，用于实时状态更新
      if (taskResult && 'taskId' in taskResult) {
        console.log(`设置当前任务ID: ${taskResult.taskId}`);
        setCurrentTaskId(taskResult.taskId);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    }
  };
  
  // 处理任务错误回调
  const handleTaskError = (errorMessage: string) => {
    console.error(`任务失败: ${errorMessage}`);
    setError(errorMessage || "图片生成失败");
    
    // 清除当前任务ID
    setCurrentTaskId(null);
  };
  
  // 重置对话
  const resetConversation = () => {
    setPrompt("");
    setUploadedImage(null);
    setError("");
    if (generatedImages.length > 0) {
      if (confirm("确定要清空当前图片吗？这不会删除您的历史记录。")) {
    setGeneratedImages([]);
      }
    }
  };
  
  // 处理风格选择
  const handleStyleChange = (styleId: string) => {
    setActiveStyle(styleId);
  };
  
  // 检查是否可以生成
  const canGenerate = () => {
    const hasUploadedImage = !!uploadedImage;
    const needsPrompt = activeStyle === "自定义";
    
    return (prompt.trim() && !isGenerating) || 
           (hasUploadedImage && !needsPrompt && !isGenerating);
  };

  // 处理任务恢复
  const handleTaskRecover = async (task: PendingTask) => {
    try {
      // 重置错误状态
      setError("");
      
      // 设置当前任务ID，以便TaskStatusListener可以处理
      setCurrentTaskId(task.taskId);
      
      // 如果有提示词，设置到输入框
      if (task.params?.prompt) {
        setPrompt(task.params.prompt);
      }
      
      // 如果有风格，设置选中的风格
      if (task.params?.style) {
        setActiveStyle(task.params.style);
      }
      
      // 恢复任务
      await recoverTask(task.taskId);
    } catch (error) {
      console.error("恢复任务失败:", error);
      showNotification("恢复任务失败", "error");
      // 恢复失败时重置状态
      setCurrentTaskId(null);
    }
  };

  // 处理任务放弃
  const handleTaskDiscard = (taskId: string) => {
    discardTask(taskId);
  };

  // 修改删除图片的函数，添加确认对话框
  const handleDeleteGeneratedImage = async (imageUrl: string): Promise<void> => {
    if (!imageUrl) return Promise.resolve();
    
    try {
      // 添加确认对话框
      if (!confirm("确定要删除这张图片吗？此操作不可撤销。")) {
        return Promise.resolve();
      }
      
      // 查找该图片是否存在于历史记录中
      const targetItem = images.find(item => item === imageUrl);
      
      // 如果图片在历史记录中存在，使用 deleteImage 函数删除
      if (targetItem) {
        // 复用历史记录中的删除函数，确保与数据库同步
        await deleteImage({ image_url: imageUrl, id: "" });
      }
      
      // 不管图片是否在历史记录中，都从当前展示列表移除
      const updatedImages = generatedImages.filter(url => url !== imageUrl);
      setGeneratedImages(updatedImages);
      
      // 关闭预览模态框
      setPreviewImage(null);
      
      // 显示成功提示
      showNotification("图片已删除", "success");
      
      // 刷新历史记录
      await refreshHistory();
    } catch (error) {
      console.error("删除图片失败:", error);
      showNotification("删除图片失败，请重试", "error");
    }
  };

  // 合并生成状态
  const generationStatus: GenerationStatus = {
    isGenerating,
    generationStage,
    generationPercentage
  };

  // 结合错误信息
  const displayError = error || generationError;
  const isInitializing = isLoadingCredits && generatedImages.length === 0;

  // 添加预览状态
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 添加一个加载状态，避免闪烁
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  
  // 使用layoutEffect提高验证优先级
  useLayoutEffect(() => {
    const checkSession = async () => {
      setIsAuthChecking(true);
      try {
        // 先尝试通过API验证用户状态
        try {
          const response = await fetch('/api/auth/status', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (!response.ok) {
            console.log('[ProtectedPage] API状态检查失败，清除认证状态并重定向到登录页');
            // 清除客户端认证状态
            await supabaseClient.auth.signOut();
            // 清除localStorage中的认证相关数据
            localStorage.removeItem('supabase.auth.token');
            localStorage.removeItem('supabase.auth.expires_at');
            localStorage.removeItem('authSession');
            // 重定向到登录页，附加过期参数
            router.replace('/login?expired=true');
            return;
          }
          
          const authData = await response.json();
          
          if (!authData.authenticated) {
            console.log('[ProtectedPage] 用户未认证，清除认证状态并重定向到登录页');
            // 清除客户端认证状态
            await supabaseClient.auth.signOut();
            // 清除localStorage中的认证相关数据
            localStorage.removeItem('supabase.auth.token');
            localStorage.removeItem('supabase.auth.expires_at');
            localStorage.removeItem('authSession');
            // 重定向到登录页，附加过期参数
            router.replace('/login?expired=true');
            return;
          }
          
          console.log('[ProtectedPage] 会话验证成功，正常加载页面');
          setIsAuthChecking(false);
        } catch (apiError) {
          console.error('[ProtectedPage] API验证异常', apiError);
          
          // API请求失败，回退到客户端验证
          const { data, error } = await supabaseClient.auth.getSession();
          
          if (error || !data.session) {
            console.log('[ProtectedPage] 客户端会话验证失败，清除认证状态并重定向到登录页');
            // 清除客户端认证状态
            await supabaseClient.auth.signOut();
            // 清除localStorage中的认证相关数据
            localStorage.removeItem('supabase.auth.token');
            localStorage.removeItem('supabase.auth.expires_at');
            localStorage.removeItem('authSession');
            // 重定向到登录页，附加过期参数
            router.replace('/login?expired=true');
            return;
          }
          
          setIsAuthChecking(false);
        }
      } catch (e) {
        console.error('[ProtectedPage] 会话验证异常', e);
        // 发生异常，也清除认证状态并重定向
        await supabaseClient.auth.signOut();
        localStorage.removeItem('supabase.auth.token');
        localStorage.removeItem('supabase.auth.expires_at');
        localStorage.removeItem('authSession');
        router.replace('/login?error=true');
      }
    };
    
    checkSession();
  }, [router]);
  
  // 如果正在检查认证状态，显示加载指示器
  if (isAuthChecking) {
    return (
      <div className="flex-1 w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">验证身份中...</p>
        </div>
      </div>
    );
  }
  
  // 完善重置上传区域函数
  const handleContinueCreation = () => {
    console.log('[ProtectedPage] 用户点击继续创作按钮，清除当前生成的图像显示');
    setCurrentGeneratedImage(null);
    setPrompt('');
    setActiveStyle('自定义');
    setImageAspectRatio(null);
    setStandardAspectRatio(null);
    setUploadedImage(null);
  };

  // 包装下载函数，确保类型安全
  const handleDownloadGeneratedImage = (imageUrl: string) => {
    downloadImage(imageUrl);
  };

  return (
    <div className="flex-1 w-full flex flex-col items-center">
      {/* 添加任务状态监听器 */}
      {currentTaskId && (
        <TaskStatusListener
          taskId={currentTaskId}
          onCompleted={handleTaskCompleted}
          onError={handleTaskError}
        />
      )}
      
      {/* 添加任务恢复对话框 */}
      <TaskRecoveryDialog
        onRecover={handleTaskRecover}
        onDiscard={handleTaskDiscard}
      />
      
      <div className="max-w-7xl w-full px-4 py-8">
        {/* 页面标题 */}
        <div className="flex flex-col items-center mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 md:mb-3 font-quicksand bg-gradient-to-r from-primary to-primary-700 bg-clip-text text-transparent">照片风格转换</h1>
          <p className="text-base md:text-lg text-muted-foreground text-center max-w-2xl font-nunito">
            将您的照片转化为魔幻风格的艺术作品，选择风格并上传照片，创造独特的视觉效果
          </p>
        </div>

        {/* 错误信息显示 */}
        {displayError && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-xl mb-6 text-sm font-nunito border border-destructive/20 shadow-ghibli-sm">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              {displayError}
            </div>
          </div>
        )}

        {/* 主要内容区域 */}
        <div className="w-full flex flex-col gap-6">
          {/* 输入区域（单列布局） */}
          <div className="flex flex-col gap-6 p-6 rounded-xl border bg-card text-card-foreground shadow-ghibli-sm transition-all duration-300 hover:shadow-ghibli">
            <div className="flex flex-col space-y-1.5 font-quicksand">
              <h3 className="text-xl font-bold leading-none tracking-tight font-quicksand text-foreground">创建新图像</h3>
              <p className="text-sm text-muted-foreground">选择风格并上传参考图片生成新图像</p>
            </div>
            
            {/* 表单内容 */}
            <div className="w-full flex flex-col gap-6">
              <StyleSelector
                activeStyle={activeStyle}
                onStyleChange={handleStyleChange}
              />
              <EnhancedImageUploader 
                uploadedImage={uploadedImage} 
                setUploadedImage={setUploadedImage}
                onImageUploaded={handleImageUpload}
                isGenerating={isGenerating}
                generationStage={generationStage}
                generationPercentage={generationPercentage}
                generatedImage={currentGeneratedImage}
                onDownload={handleDownloadGeneratedImage}
                onContinueCreation={handleContinueCreation}
              />
              <PromptInput
                prompt={prompt}
                onPromptChange={setPrompt}
                onGenerate={handleGenerateImage}
                isGenerating={isGenerating}
                canGenerate={canGenerate()}
                hasLowCredits={credits !== null && credits <= 0}
                activeStyle={activeStyle}
              />
            </div>
          </div>

          {/* 图片展示区域 */}
          <div className="rounded-xl border bg-card text-card-foreground shadow-ghibli-sm transition-all duration-300 hover:shadow-ghibli">
            <div className="flex flex-col space-y-1.5 p-6 font-quicksand">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold leading-none tracking-tight font-quicksand text-foreground flex items-center">
                  生成结果
                  {isInitializing && (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin text-primary" />
                  )}
                </h3>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/protected/history")}
                  className="flex items-center text-sm hover:bg-primary/10 hover:text-primary border-primary/30 font-quicksand shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 hover:translate-y-[-1px]"
                >
                  查看更多
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-6 pt-0 font-nunito">
              {/* 生成结果展示 */}
              {(generatedImages.length > 0) && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                  {/* 移除生成中骨架图，只显示历史生成的图片 */}
                  {generatedImages.slice(0, 4).map((imageUrl, index) => (
                    <div key={imageUrl + index} className="aspect-square w-full">
                      <div 
                        className="aspect-square relative bg-card/40 border border-border rounded-xl overflow-hidden shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 cursor-pointer w-full h-full"
                        onClick={() => setPreviewImage(imageUrl)}
                      >
                        <LazyImage
                          src={getImageUrl(imageUrl)}
                          alt={`生成的图片 ${index + 1}`}
                          onImageLoad={() => handleImageLoad(imageUrl)}
                          onImageError={() => handleImageError(imageUrl)}
                          className="w-full h-full object-cover"
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
                    </div>
                  ))}
                </div>
              )}
              
              {/* 空状态提示 */}
              {!isGenerating && generatedImages.length === 0 && (
                <div className="py-14 flex flex-col items-center justify-center">
                  <div className="bg-card/60 p-6 rounded-xl border border-border flex flex-col items-center shadow-ghibli-sm">
                    <div className="bg-muted/50 rounded-full p-3 mb-3">
                      <ImageIcon className="h-6 w-6 text-primary/60" />
                    </div>
                    <p className="text-foreground/80 text-center">尚未生成任何图片</p>
                    <p className="text-muted-foreground text-sm text-center mt-1">选择风格并上传图片开始创作</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      
        {/* 积分充值对话框 */}
        {showCreditRechargeDialog && (
          <CreditRechargeDialog
            isOpen={true}
            onClose={() => setShowCreditRechargeDialog(false)}
            onSuccess={async () => {
              await refreshCredits(true, false);
              showNotification("充值成功，您的积分已更新");
            }}
            credits={credits || 0}
          />
        )}
      </div>
      
      {/* 图片预览模态框 */}
      <ImagePreviewModal
        isOpen={!!previewImage}
        imageUrl={previewImage}
        onClose={() => setPreviewImage(null)}
        onDownload={previewImage ? () => downloadImage(previewImage) : undefined}
        onDelete={previewImage ? () => handleDeleteGeneratedImage(previewImage) : undefined}
      />
    </div>
  );
}
