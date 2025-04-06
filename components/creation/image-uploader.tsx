import React, { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, X, Camera } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageLoading, ImageError } from "@/components/ui/loading-states";

interface ImageUploaderProps {
  uploadedImage: string | null;
  setUploadedImage: (url: string | null) => void;
  onImageUploaded?: (dataUrl: string, width: number, height: number) => void;
}

export default function ImageUploader({
  uploadedImage,
  setUploadedImage,
  onImageUploaded = () => {},
}: ImageUploaderProps) {
  // 组件状态
  const [dragActive, setDragActive] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  
  // 文件输入引用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件输入变化
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
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