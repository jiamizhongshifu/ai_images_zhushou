import React, { useRef } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ImageUploaderProps {
  uploadedImage: string | null;
  setUploadedImage: (imageUrl: string | null) => void;
  onImageUploaded?: (imageUrl: string, width: number, height: number) => void;
}

export default function ImageUploader({ 
  uploadedImage, 
  setUploadedImage,
  onImageUploaded
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
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
          
          if (onImageUploaded) {
            onImageUploaded(dataUrl, width, height);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error('处理上传图片时出错:', error);
    }
  };

  return (
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
  );
} 