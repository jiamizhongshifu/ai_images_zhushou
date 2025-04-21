import React from "react";
import ImageUploader from "./image-uploader";
import { GenerationStage } from "@/components/ui/skeleton-generation";

// 增强版图片上传组件Props
interface EnhancedImageUploaderProps {
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

/**
 * 增强版图片上传组件
 * 
 * 扩展了原始ImageUploader组件的功能，添加了生成状态和结果预览的支持
 */
export default function EnhancedImageUploader({
  uploadedImage,
  setUploadedImage,
  onImageUploaded,
  isGenerating = false,
  generationStage,
  generationPercentage,
  generatedImage = null,
  onDownload = () => {},
  onContinueCreation = () => {},
}: EnhancedImageUploaderProps) {
  
  // 这里通过直接使用ImageUploader组件，将增强的属性传递过去
  return (
    <ImageUploader
      uploadedImage={uploadedImage}
      setUploadedImage={setUploadedImage}
      onImageUploaded={onImageUploaded}
      isGenerating={isGenerating}
      generationStage={generationStage}
      generationPercentage={generationPercentage}
      generatedImage={generatedImage}
      onDownload={onDownload}
      onContinueCreation={onContinueCreation}
    />
  );
} 