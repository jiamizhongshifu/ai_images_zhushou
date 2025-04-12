"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { generatePromptWithStyle } from "@/app/config/styles";
import { ResponsiveContainer, ResponsiveSection, ResponsiveGrid } from "@/components/ui/responsive-container";

// 导入创作页组件
import ImageUploader from "@/components/creation/image-uploader";
import StyleSelector from "@/components/creation/style-selector";
import PromptInput from "@/components/creation/prompt-input";
import GeneratedImageGallery from "@/components/creation/generated-image-gallery";

// 导入自定义hooks
import useUserCredits from "@/hooks/useUserCredits";
import useImageHistory from "@/hooks/useImageHistory";
import useImageGeneration from "@/hooks/useImageGeneration";
import useImageHandling from "@/hooks/useImageHandling";
import useNotification from "@/hooks/useNotification";
import TaskStatusListener from "@/app/components/TaskStatusListener";

// 动态导入CreditRechargeDialog组件
const CreditRechargeDialog = dynamic(
  () => import("@/components/payment/credit-recharge-dialog"),
  { ssr: false, loading: () => null }
);

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
  
  // 使用自定义hooks
  const { credits, isLoading: isLoadingCredits, refetch: refreshCredits } = useUserCredits();
  const { images, refetch: refreshHistory, deleteImage } = useImageHistory();
  const { showNotification } = useNotification();
  const { 
    handleImageLoad, 
    handleImageError, 
    downloadImage,
    imageLoadRetries
  } = useImageHandling();
  
  const {
    generatedImages,
    isGenerating,
    error: generationError,
    generateImage,
    setGeneratedImages,
    generationStage,
    generationPercentage
  } = useImageGeneration(
    showNotification
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
  
  // 初始加载时同步历史记录图片到生成状态
  useEffect(() => {
    if (images.length > 0 && generatedImages.length === 0) {
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
  const handleTaskCompleted = (imageUrl: string) => {
    console.log(`任务完成，收到图片URL: ${imageUrl}`);
    
    // 更新生成的图片列表
    if (imageUrl) {
      const newImages = [imageUrl, ...generatedImages.filter(url => url !== imageUrl)];
      setGeneratedImages(newImages);
    }
    
    // 清除当前任务ID - 不再在这里刷新点数和历史记录
    // 生成完成刷新逻辑已经移至generationStage监听的useEffect中
    setCurrentTaskId(null);
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

  // 结合错误信息
  const displayError = error || generationError;
  const isInitializing = isLoadingCredits && generatedImages.length === 0;

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
              {/* 生成结果展示 - 更新为包含骨架屏和进度显示 */}
              <GeneratedImageGallery
                images={generatedImages.slice(0, 4)}
                isLoading={isInitializing}
                // @ts-ignore 使用ts-ignore跳过类型检查，因为我们已经确保这些属性在GeneratedImageGallery组件中可用
                isGenerating={isGenerating}
                generationStage={generationStage}
                generationPercentage={generationPercentage}
                onImageLoad={handleImageLoad}
                onImageError={handleImageError}
                onDownloadImage={downloadImage}
                onDeleteImage={deleteImage}
                hideViewMoreButton={true}
                maxRows={1}
              />
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
    </div>
  );
}
