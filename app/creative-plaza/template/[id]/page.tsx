"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, Sparkles, Upload, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import EnhancedImageUploader from "@/components/creation/enhanced-image-uploader";

// 模板详情类型
interface Template {
  id: string;
  name: string;
  description: string;
  preview_image: string;
  base_prompt: string;
  style_id: string | null;
  requires_image: boolean;
  prompt_required: boolean;
  prompt_guide: string | null;
  prompt_placeholder: string | null;
  tags: string[];
  use_count: number;
}

export default function TemplateDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  // 状态管理
  const [template, setTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // 获取模板详情
  useEffect(() => {
    const fetchTemplateDetail = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/templates/${id}`);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("模板不存在");
          }
          throw new Error("获取模板详情失败");
        }

        const data = await response.json();

        if (data.success) {
          setTemplate(data.data);
        } else {
          throw new Error(data.error || "获取模板详情失败");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "获取模板详情失败");
        console.error("获取模板详情错误:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplateDetail();
  }, [id]);

  // 更新使用次数
  const updateUseCount = async () => {
    try {
      await fetch(`/api/templates/${id}`, {
        method: "PATCH",
      });
    } catch (err) {
      console.error("更新使用次数失败:", err);
    }
  };

  // 处理生成图片
  const handleGenerateImage = async () => {
    // 检查是否满足生成条件
    if (template?.requires_image && !uploadedImage) {
      setError("请上传参考图片");
      return;
    }

    if (template?.prompt_required && !prompt.trim()) {
      setError("请输入提示词");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      // 更新使用次数
      await updateUseCount();

      // 跳转到生成页面，携带参数
      const searchParams = new URLSearchParams();
      
      // 添加模板ID
      searchParams.append("templateId", id);
      
      // 添加提示词
      if (prompt.trim()) {
        searchParams.append("prompt", prompt);
      }
      
      // 添加风格
      if (template?.style_id) {
        searchParams.append("style", template.style_id);
      }
      
      // 跳转到受保护的创作页面，传递参数
      // 注意：这里假设有一个现成的生成页面，实际项目中可能需要调整
      router.push(`/protected?${searchParams.toString()}`);
    } catch (err) {
      setError("生成图片失败，请重试");
      console.error("生成图片错误:", err);
      setIsGenerating(false);
    }
  };

  // 处理图片上传
  const handleImageUpload = (dataUrl: string) => {
    setUploadedImage(dataUrl);
    setError(null);
  };

  // 加载状态
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[60vh]">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">加载模板详情...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error || !template) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Link href="/creative-plaza" className="flex items-center text-primary mb-8">
          <ChevronLeft className="h-4 w-4 mr-1" />
          返回创意广场
        </Link>
        
        <Card className="p-8 text-center max-w-2xl mx-auto">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">{error || "模板不存在"}</h1>
          <p className="text-muted-foreground mb-6">
            无法找到您请求的模板，请返回创意广场浏览其他模板。
          </p>
          <Button asChild>
            <Link href="/creative-plaza">返回创意广场</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 返回链接 */}
      <Link href="/creative-plaza" className="flex items-center text-primary mb-8">
        <ChevronLeft className="h-4 w-4 mr-1" />
        返回创意广场
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 模板预览 */}
        <div>
          <div className="relative aspect-[4/3] mb-4 rounded-xl overflow-hidden shadow-lg">
            <Image
              src={template.preview_image}
              alt={template.name}
              fill
              priority
              className="object-cover"
            />
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {template.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="text-sm text-muted-foreground">
            已有 {template.use_count} 人使用此模板
          </div>
        </div>

        {/* 模板信息和表单 */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-3">{template.name}</h1>
            <p className="text-muted-foreground">{template.description}</p>
          </div>

          <div className="space-y-4">
            {/* 图片上传区 */}
            {template.requires_image && (
              <div className="space-y-2">
                <h3 className="text-lg font-medium">1. 上传参考图片</h3>
                <EnhancedImageUploader
                  uploadedImage={uploadedImage}
                  setUploadedImage={setUploadedImage}
                  onImageUploaded={handleImageUpload}
                  isGenerating={false}
                />
              </div>
            )}

            {/* 提示词输入区 */}
            <div className="space-y-2">
              <h3 className="text-lg font-medium">
                {template.requires_image ? "2. " : "1. "}
                {template.prompt_required ? "输入提示词" : "输入提示词（可选）"}
              </h3>
              {template.prompt_guide && (
                <p className="text-sm text-muted-foreground mb-2">
                  {template.prompt_guide}
                </p>
              )}
              <Textarea
                placeholder={template.prompt_placeholder || "请描述您想要的效果..."}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[120px]"
              />
            </div>

            {/* 生成按钮 */}
            <Button
              onClick={handleGenerateImage}
              disabled={isGenerating || (template.requires_image && !uploadedImage) || (template.prompt_required && !prompt.trim())}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  生成图片
                </>
              )}
            </Button>

            {/* 错误提示 */}
            {error && (
              <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 