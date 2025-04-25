import React, { useState, useCallback } from 'react';

interface GenerateImageParams {
  prompt?: string;
  image?: string;
  imagePath?: string;
  style?: string;
  aspectRatio?: string;
  standardAspectRatio?: string;
}

const useImageGeneration = (
  showNotification: (message: string, type: 'success' | 'error' | 'info') => void,
  onSuccess?: (imageUrl: string) => Promise<void>
) => {
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationStage, setGenerationStage] = useState<string>('');
  const [generationPercentage, setGenerationPercentage] = useState<number>(0);

  const addUniqueImage = useCallback((imageUrl: string) => {
    setGeneratedImages(prev => {
      if (prev.includes(imageUrl)) {
        return prev;
      }
      return [imageUrl, ...prev];
    });
  }, []);

  const generateImage = useCallback(async (params: GenerateImageParams) => {
    setIsGenerating(true);
    setError(null);
    setGenerationStage('准备中');
    setGenerationPercentage(0);

    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 2000;

    const attemptGeneration = async (): Promise<string> => {
      try {
        const response = await fetch('/api/generate-image-task', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || '生成失败');
        }

        if (!data.imageUrl) {
          throw new Error('未返回图片URL');
        }

        return data.imageUrl;
      } catch (err) {
        if (retryCount < maxRetries) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return attemptGeneration();
        }
        throw err;
      }
    };

    try {
      const imageUrl = await attemptGeneration();
      addUniqueImage(imageUrl);
      if (onSuccess) {
        await onSuccess(imageUrl);
      }
      showNotification('图片生成成功', 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '生成图片时发生错误';
      setError(errorMessage);
      showNotification(errorMessage, 'error');
    } finally {
      setIsGenerating(false);
      setGenerationStage('');
      setGenerationPercentage(0);
    }
  }, [showNotification, onSuccess, addUniqueImage]);

  return {
    generatedImages,
    setGeneratedImages,
    isGenerating,
    error,
    generateImage,
    generationStage,
    generationPercentage,
  };
};

export default useImageGeneration; 