import React, { useState, useRef, ChangeEvent } from "react";
import { Upload, X, Image as ImageIcon, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ImageUploaderProps {
  uploadedImage: string | null;
  setUploadedImage: (image: string | null) => void;
  onImageUploaded?: (dataUrl: string, width: number, height: number) => void;
}

export default function ImageUploader({
  uploadedImage,
  setUploadedImage,
  onImageUploaded,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  
  // 处理文件选择
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };
  
  // 处理拖放
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };
  
  const handleDragLeave = () => {
    setDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      processImageFile(file);
    }
  };
  
  // 处理图片文件
  const processImageFile = (file: File) => {
    setImageLoading(true);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      
      // 获取图片尺寸
      const img = new Image();
      img.onload = () => {
        setUploadedImage(dataUrl);
        if (onImageUploaded) {
          onImageUploaded(dataUrl, img.width, img.height);
        }
        setImageLoading(false);
      };
      img.onerror = () => {
        console.error("图片加载失败");
        setImageLoading(false);
      };
      img.src = dataUrl;
    };
    
    reader.onerror = () => {
      console.error("文件读取失败");
      setImageLoading(false);
    };
    
    reader.readAsDataURL(file);
  };
  
  // 清除上传图片
  const clearUploadedImage = () => {
    setUploadedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  // 触发文件选择框
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };
  
  return (
    <div className="space-y-3">
      <h3 className="text-base font-medium font-quicksand text-foreground/90">
        上传图片
      </h3>
      
      {/* 上传区域 */}
      <Card className={`ghibli-card ${dragging ? 'ring-2 ring-primary/30' : ''}`}>
        <CardContent className="p-0">
          {!uploadedImage ? (
            // 拖放上传区域
            <div
              className={`flex flex-col items-center justify-center p-6 min-h-[240px] border-2 border-dashed border-muted-foreground/20 rounded-xl m-1 ${
                dragging ? "border-primary/50 bg-primary/5" : "hover:border-primary/30 hover:bg-card/60"
              } transition-all duration-300 cursor-pointer`}
              onClick={triggerFileInput}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="bg-muted/50 rounded-full p-4 mb-4 animate-pulse-soft">
                <Upload className="h-6 w-6 text-primary/70" />
              </div>
              <p className="text-base font-medium mb-2 font-quicksand text-foreground/90">拖放图片到这里</p>
              <p className="text-sm text-muted-foreground mb-4">或选择一张图片上传</p>
              <Button
                variant="outline"
                className="ghibli-btn-outline"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerFileInput();
                }}
              >
                <Camera className="mr-2 h-4 w-4" />
                浏览文件
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
          ) : (
            // 已上传图片预览
            <div className="relative p-4">
              <div className="flex items-center justify-center">
                {/* 加载指示器 */}
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10 animate-fade-in">
                    <div className="flex flex-col items-center">
                      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                      <p className="mt-2 text-sm text-foreground/80 font-quicksand">处理图片中...</p>
                    </div>
                  </div>
                )}
                
                {/* 图片预览 */}
                <div className="relative max-w-full animate-scale-in">
                  <img
                    src={uploadedImage}
                    alt="上传的图片"
                    className="max-w-full max-h-[500px] rounded-lg shadow-ghibli-sm object-contain"
                    style={{ maxWidth: '100%', objectFit: 'scale-down' }}
                    onLoad={() => setImageLoading(false)}
                  />
                </div>
              </div>
              
              {/* 删除按钮 */}
              <Button
                variant="outline"
                size="icon"
                className="absolute top-3 right-3 h-8 w-8 rounded-full bg-background/80 hover:bg-background backdrop-blur-sm shadow-ghibli-sm hover:shadow-ghibli border-border hover:border-destructive/50 transition-all duration-300 z-10"
                onClick={clearUploadedImage}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 