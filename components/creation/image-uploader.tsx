import React, { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, X, Camera, Download, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageLoading, ImageError } from "@/components/ui/loading-states";
import { compressImage } from '@/utils/image/compressImage';
import { useToast } from "@/components/ui/use-toast";
import { ImageGenerationSkeleton, GenerationStage } from "@/components/ui/skeleton-generation";

// 定义上传区域的多种状态
type UploaderState = 'idle' | 'uploading' | 'preview' | 'generating' | 'result';

interface ImageUploaderProps {
  uploadedImage: string | null;
  setUploadedImage: (url: string | null) => void;
  onImageUploaded?: (dataUrl: string, width: number, height: number) => void;
  isGenerating?: boolean;
  generationStage?: GenerationStage;
  generationPercentage?: number;
  generatedImage?: string | null;
  onDownload?: (imageUrl: string) => void;
  onContinueCreation?: () => void;
}

// 图片大小限制配置
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_WIDTH = 2500;
const MAX_IMAGE_HEIGHT = 2500;
const DEFAULT_QUALITY = 0.85;

// 压缩质量等级
const COMPRESSION_LEVELS = [
  { maxSize: 8192, quality: 0.9 },  // 8MB -> 90%质量
  { maxSize: 6144, quality: 0.85 }, // 6MB -> 85%质量  
  { maxSize: 4096, quality: 0.8 },  // 4MB -> 80%质量
  { maxSize: 2048, quality: 0.75 }  // 2MB -> 75%质量
];

export default function ImageUploader({
  uploadedImage,
  setUploadedImage,
  onImageUploaded = () => {},
  isGenerating = false,
  generationStage,
  generationPercentage,
  generatedImage = null,
  onDownload = () => {},
  onContinueCreation = () => {},
}: ImageUploaderProps) {
  const { toast } = useToast();
  
  // 组件状态
  const [dragActive, setDragActive] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  
  // 计算当前上传器状态
  const getUploaderState = (): UploaderState => {
    if (isGenerating) return 'generating';
    if (generatedImage) return 'result';
    if (uploadedImage) return 'preview';
    if (imageLoading) return 'uploading';
    return 'idle';
  };
  
  const currentState = getUploaderState();
  
  // 文件输入引用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件输入变化
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
      toast({
        type: "error",
        title: "文件过大",
        description: "文件大小超过10MB限制",
        variant: "destructive",
      });
      return;
    }

    setImageError(null);
    setImageLoading(true);

    try {
      // 读取文件为base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      // 获取图片尺寸
      const imgElement = document.createElement('img');
      const dimensionsPromise = new Promise<{width: number, height: number}>((resolve, reject) => {
        imgElement.onload = () => resolve({
          width: imgElement.width,
          height: imgElement.height
        });
        imgElement.onerror = reject;
        imgElement.src = base64;
      });
      const { width, height } = await dimensionsPromise;

      // 确定是否需要压缩
      let needsCompression = false;
      let targetQuality = DEFAULT_QUALITY;
      
      // 检查文件大小，确定压缩质量
      for (const level of COMPRESSION_LEVELS) {
        if (file.size > level.maxSize * 1024) {
          needsCompression = true;
          targetQuality = level.quality;
          break;
        }
      }

      // 检查尺寸是否需要调整
      let finalMaxWidth = MAX_IMAGE_WIDTH;
      let finalMaxHeight = MAX_IMAGE_HEIGHT;
      if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
        needsCompression = true;
        const ratio = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height);
        finalMaxWidth = Math.round(width * ratio);
        finalMaxHeight = Math.round(height * ratio);
      }

      // 如果需要压缩
      let processedImage = base64;
      if (needsCompression) {
        console.log(`[ImageUploader] 开始压缩图片 (${(file.size/1024/1024).toFixed(2)}MB)...`);
        processedImage = await compressImage(base64, {
          maxWidth: finalMaxWidth,
          maxHeight: finalMaxHeight,
          quality: targetQuality
        });
        console.log(`[ImageUploader] 压缩完成`);
      }

      // 更新预览和调用回调
      setUploadedImage(processedImage);
      onImageUploaded(processedImage, width, height);
      setImageLoading(false);

    } catch (error) {
      console.error('[ImageUploader] 图片处理失败:', error);
      setImageError("图片处理失败，请重试");
      setImageLoading(false);
      toast({
        type: "error",
        title: "处理失败",
        description: "图片处理失败，请重试",
        variant: "destructive",
      });
    }
  };

  // 处理拖拽事件
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // 处理拖放事件
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const imageFile = files.find(file => file.type.startsWith("image/"));
      
      if (imageFile) {
        processImageFile(imageFile);
      } else {
        setImageError("请选择有效的图片文件");
      }
    }
  };
  
  // 处理文件点击上传
  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };
  
  // 处理移除图片
  const handleRemoveImage = () => {
    setUploadedImage(null);
    setImageError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  // 处理图片文件处理
  const processImageFile = (file: File) => {
    setImageError(null);
    setImageLoading(true);
    
    // 限制文件大小（10MB）
    if (file.size > 10 * 1024 * 1024) {
      setImageError("图片过大，请选择小于10MB的文件");
      setImageLoading(false);
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      
      // 检查图片尺寸并回调
      const img = new globalThis.Image();
      img.src = dataUrl;
      
      img.onload = () => {
        // 回调函数包含宽高信息
        onImageUploaded(dataUrl, img.width, img.height);
        setUploadedImage(dataUrl);
        setImageLoading(false);
      };
      
      img.onerror = () => {
        setImageError("图片加载失败，请选择其他图片");
        setImageLoading(false);
      };
    };
    
    reader.onerror = () => {
      setImageError("读取文件时出错，请重试");
      setImageLoading(false);
    };
    
    reader.readAsDataURL(file);
  };
  
  // 图片加载处理
  const handleImageLoad = () => {
    setImageLoading(false);
  };
  
  // 图片错误处理
  const handleImageError = () => {
    setImageError("图片加载失败，请尝试重新上传");
    setImageLoading(false);
  };

  // 处理继续创作
  const handleContinueCreation = () => {
    onContinueCreation();
  };
  
  // 处理下载生成的图片
  const handleDownloadImage = () => {
    if (generatedImage) {
      onDownload(generatedImage);
    }
  };

  return (
    <Card className="bg-card/60 rounded-xl border border-border shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300">
      <CardContent className="p-5">
        {/* 卡片标题 - 根据状态显示不同内容 */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium font-quicksand text-foreground/90">
            {currentState === 'generating' ? '正在生成图片...' : 
             currentState === 'result' ? '生成结果' : '上传照片'}
          </h3>
        </div>
        
        {/* 文件拖放区域 - 增加高度，从300px到400px */}
        <div
          className={`relative min-h-[400px] h-[400px] border-2 border-dashed rounded-lg p-4 transition-all flex flex-col items-center justify-center ${
            currentState === 'idle' ? 'cursor-pointer' : ''
          } ${
            dragActive 
              ? "border-primary/60 bg-primary/5" 
              : currentState === 'generating'
                ? "border-primary/30 bg-card/80"
                : currentState === 'result'
                  ? "border-primary/40 bg-card/80"
                  : uploadedImage
                    ? "border-primary/30 bg-card/80" 
                    : "border-border/60 bg-muted/30 hover:border-border"
          }`}
          onDragEnter={currentState === 'idle' ? handleDrag : undefined}
          onDragLeave={currentState === 'idle' ? handleDrag : undefined}
          onDragOver={currentState === 'idle' ? handleDrag : undefined}
          onDrop={currentState === 'idle' ? handleDrop : undefined}
          onClick={currentState === 'idle' ? handleButtonClick : undefined}
        >
          {/* 根据不同状态显示不同内容 */}
          {currentState === 'idle' && (
            // 空闲状态 - 显示上传提示
            <div className="flex flex-col items-center text-center max-w-xs mx-auto">
              {/* 按钮图标 */}
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                <Upload className="h-5 w-5 text-primary/80" />
              </div>
              
              {/* 提示文本 */}
              <p className="text-foreground/90 mb-1 font-medium">拖放或点击上传照片</p>
              <p className="text-xs text-muted-foreground">
                支持 JPG, PNG, WebP 格式 (最大 10MB)
              </p>
              
              {/* 隐藏的文件输入 */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
          )}
          
          {currentState === 'uploading' && (
            // 上传中状态
            <div className="flex flex-col items-center">
              <ImageLoading message="上传中..." />
            </div>
          )}
          
          {currentState === 'preview' && uploadedImage && (
            // 预览状态 - 显示上传的图片和删除按钮
            <>
              <LazyImage
                src={uploadedImage}
                alt="上传的图片"
                className="w-full h-full object-contain max-h-[300px]"
                fadeIn={true}
                blurEffect={true}
                onImageLoad={handleImageLoad}
                onImageError={handleImageError}
                loadingElement={<ImageLoading message="加载中..." />}
                errorElement={<ImageError message="加载失败" />}
              />
              
              {/* 删除按钮 */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveImage();
                }}
                className="absolute top-2 right-2 w-8 h-8 bg-background/80 backdrop-blur-sm rounded-full flex items-center justify-center border border-border/60 shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
              >
                <X className="h-4 w-4 text-foreground/80" />
              </button>
            </>
          )}
          
          {currentState === 'generating' && (
            // 生成中状态 - 显示生成骨架图
            <div className="flex flex-col items-center justify-center w-full h-full">
              <ImageGenerationSkeleton 
                stage={generationStage} 
                percentage={generationPercentage} 
                isGenerating={isGenerating}
              />
            </div>
          )}
          
          {currentState === 'result' && generatedImage && (
            // 结果状态 - 显示生成的图片和按钮组
            <>
              <LazyImage
                src={generatedImage}
                alt="生成的图片"
                className="w-full h-full object-contain max-h-[380px]"
                fadeIn={true}
                blurEffect={true}
                loadingElement={<ImageLoading message="加载中..." />}
                errorElement={<ImageError message="加载失败" />}
              />
              
              {/* 按钮组 - 放在右上角 */}
              <div className="absolute top-2 right-2 flex gap-2">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContinueCreation();
                  }}
                  className="bg-background/90 backdrop-blur-sm text-foreground px-3 py-1.5 rounded-full flex items-center justify-center text-sm shadow-ghibli-sm hover:shadow-ghibli hover:bg-background transition-all duration-300 border border-border/60"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  继续创作
                </button>
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadImage();
                  }}
                  className="bg-primary/90 text-white px-3 py-1.5 rounded-full flex items-center justify-center text-sm shadow-ghibli-sm hover:shadow-ghibli hover:bg-primary transition-all duration-300"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  下载
                </button>
              </div>
            </>
          )}
          
          {imageError && (
            // 错误状态
            <div className="absolute inset-0 bg-destructive/10 flex items-center justify-center">
              <div className="bg-card p-4 rounded-lg shadow-ghibli text-center">
                <p className="text-destructive mb-2">{imageError}</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageError(null);
                    handleButtonClick();
                  }}
                >
                  重新上传
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 