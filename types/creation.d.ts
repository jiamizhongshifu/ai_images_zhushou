// 声明StyleCard组件模块
declare module '@/components/creation/style-card' {
  import { FC } from 'react';
  import { StyleConfig } from '@/app/config/styles';
  
  interface StyleCardProps {
    style: StyleConfig;
    isActive: boolean;
    onClick: () => void;
  }
  
  const StyleCard: FC<StyleCardProps>;
  export default StyleCard;
}

// 声明ImageUploader组件模块
declare module '@/components/creation/image-uploader' {
  import { FC } from 'react';
  
  interface ImageUploaderProps {
    uploadedImage: string | null;
    setUploadedImage: (imageUrl: string | null) => void;
    onImageUploaded?: (imageUrl: string, width: number, height: number) => void;
  }
  
  const ImageUploader: FC<ImageUploaderProps>;
  export default ImageUploader;
}

// 声明StyleSelector组件模块
declare module '@/components/creation/style-selector' {
  import { FC } from 'react';
  
  interface StyleSelectorProps {
    activeStyle: string;
    onStyleChange: (styleId: string) => void;
  }
  
  const StyleSelector: FC<StyleSelectorProps>;
  export default StyleSelector;
}

// 声明PromptInput组件模块
declare module '@/components/creation/prompt-input' {
  import { FC } from 'react';
  
  interface PromptInputProps {
    prompt: string;
    onPromptChange: (value: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    canGenerate: boolean;
    hasLowCredits?: boolean;
    activeStyle?: string;
  }
  
  const PromptInput: FC<PromptInputProps>;
  export default PromptInput;
}

// 声明GeneratedImageGallery组件模块
declare module '@/components/creation/generated-image-gallery' {
  import { FC } from 'react';
  
  interface GeneratedImageGalleryProps {
    images: string[];
    isLoading: boolean;
    onImageLoad: (imageUrl: string, e?: React.SyntheticEvent<HTMLImageElement>) => void;
    onImageError: (imageUrl: string, e?: React.SyntheticEvent<HTMLImageElement>) => void;
    onDownloadImage: (imageUrl: string) => void;
    onDeleteImage?: (imageUrl: string) => Promise<void>;
    hideViewMoreButton?: boolean;
    isLargerSize?: boolean;
    maxRows?: number;
  }
  
  const GeneratedImageGallery: FC<GeneratedImageGalleryProps>;
  export default GeneratedImageGallery;
}

// 声明Textarea组件模块
declare module '@/components/ui/textarea' {
  import { TextareaHTMLAttributes, ForwardRefExoticComponent, RefAttributes } from 'react';
  
  export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}
  
  export const Textarea: ForwardRefExoticComponent<TextareaProps & RefAttributes<HTMLTextAreaElement>>;
}

// 增强全局Window接口，添加Image构造函数
interface Window {
  Image: {
    new(): HTMLImageElement;
    new(width: number, height?: number): HTMLImageElement;
    prototype: HTMLImageElement;
  }
} 