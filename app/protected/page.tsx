"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import ImageUploader from "@/components/creation/image-uploader";
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
  
  // 状态管理
  const [prompt, setPrompt] = useState("");
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
    undefined,
    refreshImages
  );
  
  // 监听生成完成状态
  useEffect(() => {
    if (generationStage === 'completed') {
      // 使用单次延迟刷新，避免多次请求
      const refreshTimeoutId = setTimeout(() => {
        console.log('[ProtectedPage] 生成完成后触发点数和历史刷新，延迟执行以减少请求');
        
        // 一次性刷新点数和历史，无需分开
        refreshCredits(false, true); // 静默强制刷新点数
        
        // 统一延迟后刷新历史，不再需要额外的计时器
        refreshHistory(false); // 使用非强制刷新
      }, 2000); // 增加延迟到2秒
      
      return () => {
        clearTimeout(refreshTimeoutId);
      };
    }
  }, [generationStage, refreshCredits, refreshHistory]);
  
  // 修改页面切换或路由变化监听函数，避免在返回时清空图片内容
  useEffect(() => {
    const handleRouteChange = () => {
      console.log('[ProtectedPage] 检测到路由变化，检查是否需要刷新图片状态');
      
      // 不再清空和重设图片状态，只在必要时刷新图片
      if (generatedImages.length === 0) {
        console.log('[ProtectedPage] 生成结果为空，尝试从历史加载图片');
        refreshHistory(false).then(() => {
          if (images.length > 0 && generatedImages.length === 0) {
            console.log('[ProtectedPage] 从历史记录加载图片: ', images.length);
            setGeneratedImages(images);
          }
        });
      }
    };
    
    // 监听路由变化
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [generatedImages, images, refreshHistory, setGeneratedImages]);
  
  // 增强初始加载时同步历史记录图片到生成状态的逻辑
  useEffect(() => {
    // 只在首次加载或生成结果为空时从历史同步
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
          console.log(`检测到上传图片比例: ${ratio}`);
          setImageAspectRatio(ratio);
          
          // 计算并设置标准比例
          const standardRatio = convertToStandardRatio(width, height);
          setStandardAspectRatio(standardRatio);
          console.log(`标准化为: ${standardRatio}`);
  };
  
  // 在页面挂载和卸载时清理图片缓存状态
  useEffect(() => {
    console.log('[ProtectedPage] 页面加载，准备处理图片');
    
    // 页面卸载时清理
    return () => {
      console.log('[ProtectedPage] 页面卸载，清理图片状态');
    };
  }, []);
  
  // 修改处理图片生成函数，保存任务ID
  const handleGenerateImage = async () => {
    setError(""); // 清除之前的错误
    
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
  
  // 处理任务完成回调
  const handleTaskCompleted = useCallback((imageUrl: string) => {
    console.log(`[ProtectedPage] 任务完成，收到图片URL: ${imageUrl}`);
    
    // 更新生成的图片列表，保持原有图片顺序
    if (imageUrl) {
      setGeneratedImages((prev: string[]) => {
        // 如果图片已存在，不重复添加
        if (prev.includes(imageUrl)) {
          return prev;
        }
        return [imageUrl, ...prev];
      });
    }
    
    // 清除当前任务ID
    setCurrentTaskId(null);
  }, [setGeneratedImages]);
  
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
            将您的照片转化为魔幻风格的艺术作品，上传照片并选择风格，创造独特的视觉效果
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
              <p className="text-sm text-muted-foreground">上传参考图片并填写提示词生成新图像</p>
            </div>
            
            {/* 表单内容 */}
            <div className="w-full flex flex-col gap-6">
              <ImageUploader 
                uploadedImage={uploadedImage} 
                setUploadedImage={setUploadedImage}
                onImageUploaded={handleImageUpload}
              />
              <StyleSelector
                activeStyle={activeStyle}
                onStyleChange={handleStyleChange}
              />
              <PromptInput
                prompt={prompt}
                onPromptChange={setPrompt}
                onGenerate={handleGenerateImage}
                isGenerating={isGenerating}
                canGenerate={canGenerate()}
                hasLowCredits={credits !== null && credits <= 0}
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
              {(isGenerating || generatedImages.length > 0) && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 h-[200px]">
                  {/* 显示生成中的骨架屏或最新生成的图片 */}
                  <div className="relative min-h-[200px] bg-card/40 border border-border rounded-xl overflow-hidden shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 w-full">
                    {isGenerating ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted/60 backdrop-blur-sm z-10">
                        <ImageGenerationSkeleton 
                          stage={generationStage} 
                          percentage={generationPercentage} 
                          isGenerating={isGenerating}
                        />
                      </div>
                    ) : generatedImages[0] && (
                      <div 
                        className="relative bg-card/40 border border-border rounded-xl overflow-hidden shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 cursor-pointer w-full h-full"
                        onClick={() => setPreviewImage(generatedImages[0])}
                      >
                        <LazyImage
                          src={getImageUrl(generatedImages[0])}
                          alt="最新生成的图片"
                          onImageLoad={() => handleImageLoad(generatedImages[0])}
                          onImageError={() => handleImageError(generatedImages[0])}
                          className="w-full h-full object-cover object-center"
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
                    )}
                  </div>
                  
                  {/* 显示历史图片，根据是否在生成中决定显示数量 */}
                  {generatedImages.slice(isGenerating ? 0 : 1, isGenerating ? 3 : 4).map((imageUrl, index) => (
                    <div key={imageUrl + index} 
                      className="relative min-h-[200px] bg-card/40 border border-border rounded-xl overflow-hidden shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 cursor-pointer w-full"
                      onClick={() => setPreviewImage(imageUrl)}
                    >
                      <LazyImage
                        src={getImageUrl(imageUrl)}
                        alt={`生成的图片 ${index + (isGenerating ? 1 : 2)}`}
                        onImageLoad={() => handleImageLoad(imageUrl)}
                        onImageError={() => handleImageError(imageUrl)}
                        className="w-full h-full object-cover object-center"
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
                    <p className="text-muted-foreground text-sm text-center mt-1">上传图片并选择风格开始创作</p>
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
