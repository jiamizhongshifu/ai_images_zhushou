import React, { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, X, Camera } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageLoading, ImageError } from "@/components/ui/loading-states";
import { compressImage } from '@/utils/image/compressImage';
import { useToast } from "@/components/ui/use-toast";

interface ImageUploaderProps {
  uploadedImage: string | null;
  setUploadedImage: (url: string | null) => void;
  onImageUploaded?: (dataUrl: string, width: number, height: number) => void;
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
}: ImageUploaderProps) {
  const { toast } = useToast();
  
  // 组件状态
  const [dragActive, setDragActive] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  
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

  return (
    <Card className="bg-card/60 rounded-xl border border-border shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300">
      <CardContent className="p-5">
        {/* 卡片标题和上传按钮 */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium font-quicksand text-foreground/90">上传照片</h3>
          
          <Button
            variant="secondary"
            size="sm"
            onClick={handleButtonClick}
            className="flex items-center text-sm bg-primary/10 text-primary hover:bg-primary/20 border-none font-quicksand shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
          >
            <Upload className="h-4 w-4 mr-1" />
            选择文件
          </Button>
        </div>
        
        {/* 文件拖放区域 */}
        <div
          className={`relative min-h-[220px] border-2 border-dashed rounded-lg p-4 transition-all flex flex-col items-center justify-center ${
            dragActive 
              ? "border-primary/60 bg-primary/5" 
              : uploadedImage
                ? "border-transparent"
                : "border-border/50 hover:border-primary/30 hover:bg-background/70"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {/* 隐藏的文件输入 */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
          />
          
          {/* 加载状态 */}
          {imageLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
              <ImageLoading message="正在加载图片..." />
            </div>
          )}
          
          {/* 错误状态 */}
          {imageError && !uploadedImage && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
              <ImageError message={imageError} />
            </div>
          )}
          
          {/* 图片预览 */}
          {uploadedImage ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <LazyImage
                src={uploadedImage}
                alt="上传的图片"
                className="max-h-[500px] max-w-full object-contain rounded-lg"
                onImageLoad={handleImageLoad}
                onImageError={handleImageError}
                fadeIn={true}
                blurEffect={true}
              />
              
              {/* 移除图片按钮 */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/30 hover:bg-black/50 text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            /* 上传提示 */
            <div className="flex flex-col items-center justify-center text-center p-4">
              <div className="bg-primary/10 p-3 rounded-full mb-3">
                <Camera className="h-6 w-6 text-primary/60" />
              </div>
              <p className="text-muted-foreground font-nunito mb-2">
                拖放图片到此处或点击选择文件
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                支持 JPG、PNG 等常见图片格式，建议使用清晰的正面照片以获得最佳效果
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 