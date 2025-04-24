"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { 
  ArrowLeft, Save, Trash, Upload, X, Plus, Sparkles 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue
} from "@/components/ui/select";
import { 
  Switch 
} from "@/components/ui/switch";
import { 
  Card, 
  CardContent 
} from "@/components/ui/card";

// 模板类型
interface Template {
  id: string;
  name: string;
  description: string;
  preview_image: string;
  style_id: string | null;
  requires_image: boolean;
  prompt_required: boolean;
  prompt_guide: string;
  prompt_placeholder: string;
  base_prompt: string;
  tags: string[];
  status: string;
}

// 风格类型
interface Style {
  id: string;
  name: string;
}

export default function EditTemplatePage() {
  // 使用 useParams 替代 params 参数
  const params = useParams();
  const idParam = params?.id as string;
  
  const router = useRouter();
  const isNewTemplate = idParam === "new";
  const templateId = isNewTemplate ? "" : idParam;
  
  // 状态管理
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styles, setStyles] = useState<Style[]>([]);
  
  // 表单数据
  const [template, setTemplate] = useState<Template>({
    id: "",
    name: "",
    description: "",
    preview_image: "",
    style_id: null,
    requires_image: false,
    prompt_required: true,
    prompt_guide: "",
    prompt_placeholder: "请输入你的创意描述...",
    base_prompt: "",
    tags: [],
    status: "draft"
  });
  
  // 标签输入
  const [tagInput, setTagInput] = useState("");
  
  // 图片上传状态
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  
  // 获取模板数据
  const fetchTemplateData = async () => {
    if (isNewTemplate) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/templates/${templateId}`);
      
      if (!response.ok) {
        throw new Error("获取模板数据失败");
      }
      
      const data = await response.json();
      
      if (data.success) {
        setTemplate(data.data);
        setPreviewUrl(data.data.preview_image);
      } else {
        throw new Error(data.error || "获取模板数据失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取模板数据失败");
      console.error("获取模板数据错误:", err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 获取风格列表
  const fetchStyles = async () => {
    try {
      const response = await fetch("/api/styles");
      
      if (!response.ok) {
        throw new Error("获取风格列表失败");
      }
      
      const data = await response.json();
      
      if (data.success) {
        setStyles(data.data || []);
      } else {
        throw new Error(data.error || "获取风格列表失败");
      }
    } catch (err) {
      console.error("获取风格列表错误:", err);
    }
  };
  
  // 初始加载
  useEffect(() => {
    fetchTemplateData();
    fetchStyles();
  }, [templateId]);
  
  // 处理表单输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTemplate(prev => ({ ...prev, [name]: value }));
  };
  
  // 处理开关变化
  const handleSwitchChange = (name: string, checked: boolean) => {
    setTemplate(prev => ({ ...prev, [name]: checked }));
  };
  
  // 处理选择变化
  const handleSelectChange = (name: string, value: string) => {
    setTemplate(prev => ({ ...prev, [name]: value === "null" ? null : value }));
  };
  
  // 处理标签添加
  const handleAddTag = () => {
    if (tagInput.trim() && !template.tags.includes(tagInput.trim())) {
      setTemplate(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput("");
    }
  };
  
  // 处理标签删除
  const handleRemoveTag = (tag: string) => {
    setTemplate(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };
  
  // 处理图片选择
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      
      // 创建预览URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  // 处理保存
  const handleSave = async () => {
    // 表单验证
    if (!template.name.trim()) {
      setError("模板名称不能为空");
      return;
    }
    
    if (!previewUrl) {
      setError("请上传预览图片");
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      // 上传图片（如果有新图片）
      let finalImageUrl = template.preview_image;
      
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        
        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          throw new Error("图片上传失败");
        }
        
        const uploadData = await uploadResponse.json();
        if (uploadData.success) {
          finalImageUrl = uploadData.url;
        } else {
          throw new Error(uploadData.error || "图片上传失败");
        }
      }
      
      // 准备提交的数据
      const templateData = {
        ...template,
        preview_image: finalImageUrl
      };
      
      // 创建或更新模板
      const url = isNewTemplate 
        ? "/api/templates" 
        : `/api/templates/${templateId}`;
      
      const method = isNewTemplate ? "POST" : "PUT";
      
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(templateData),
      });
      
      if (!response.ok) {
        throw new Error(`${isNewTemplate ? "创建" : "更新"}模板失败`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 保存成功，跳转回列表页
        router.push("/admin/templates");
      } else {
        throw new Error(data.error || `${isNewTemplate ? "创建" : "更新"}模板失败`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `${isNewTemplate ? "创建" : "更新"}模板失败`);
      console.error(`${isNewTemplate ? "创建" : "更新"}模板错误:`, err);
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isNewTemplate ? "创建新模板" : "编辑模板"}
        </h1>
      </div>
      
      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg mb-6">
          {error}
        </div>
      )}
      
      {isLoading ? (
        <div className="flex justify-center items-center h-[400px]">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左侧表单 */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-lg font-medium">基本信息</h2>
                
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    模板名称 <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="name"
                    name="name"
                    value={template.name}
                    onChange={handleInputChange}
                    placeholder="输入模板名称"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    模板描述
                  </label>
                  <Textarea
                    id="description"
                    name="description"
                    value={template.description}
                    onChange={handleInputChange}
                    placeholder="输入模板描述"
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">风格分类</label>
                  <Select
                    value={template.style_id === null ? "null" : template.style_id}
                    onValueChange={(value) => handleSelectChange("style_id", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择风格类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="null">无风格</SelectItem>
                      {styles.map((style) => (
                        <SelectItem key={style.id} value={style.id}>
                          {style.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">标签</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {template.tags.map((tag) => (
                      <Badge 
                        key={tag} 
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {tag}
                        <button 
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="输入标签"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleAddTag}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      添加
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-lg font-medium">提示词设置</h2>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label htmlFor="prompt_required" className="text-sm font-medium">
                      需要提示词
                    </label>
                    <Switch
                      id="prompt_required"
                      checked={template.prompt_required}
                      onCheckedChange={(checked: boolean) => 
                        handleSwitchChange("prompt_required", checked)
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="requires_image" className="text-sm font-medium">
                      需要上传图片
                    </label>
                    <Switch
                      id="requires_image"
                      checked={template.requires_image}
                      onCheckedChange={(checked: boolean) => 
                        handleSwitchChange("requires_image", checked)
                      }
                    />
                  </div>
                </div>
                
                {template.prompt_required && (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="prompt_guide" className="text-sm font-medium">
                        提示词指南
                      </label>
                      <Textarea
                        id="prompt_guide"
                        name="prompt_guide"
                        value={template.prompt_guide}
                        onChange={handleInputChange}
                        placeholder="输入提示词指南，帮助用户理解如何编写高质量提示词"
                        rows={3}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label htmlFor="prompt_placeholder" className="text-sm font-medium">
                        提示词占位文本
                      </label>
                      <Input
                        id="prompt_placeholder"
                        name="prompt_placeholder"
                        value={template.prompt_placeholder}
                        onChange={handleInputChange}
                        placeholder="输入提示词占位文本"
                      />
                    </div>
                  </>
                )}
                
                <div className="space-y-2">
                  <label htmlFor="base_prompt" className="text-sm font-medium">
                    基础提示词
                  </label>
                  <Textarea
                    id="base_prompt"
                    name="base_prompt"
                    value={template.base_prompt}
                    onChange={handleInputChange}
                    placeholder="输入基础提示词，将与用户提示词组合使用"
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => router.back()}
              >
                取消
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-current border-t-transparent animate-spin rounded-full"></div>
                      保存中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Save className="h-4 w-4" />
                      保存
                    </span>
                  )}
                </Button>
                {!isNewTemplate && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm("确定要删除此模板吗？此操作不可撤销。")) {
                        // 删除模板逻辑
                        alert("删除模板：" + templateId);
                        router.push("/admin/templates");
                      }
                    }}
                  >
                    <Trash className="h-4 w-4 mr-2" />
                    删除
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          {/* 右侧预览 */}
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-lg font-medium">预览图片</h2>
                
                <div className="space-y-4">
                  {previewUrl ? (
                    <div className="relative aspect-square w-full overflow-hidden rounded-lg border">
                      <Image
                        src={previewUrl}
                        alt="模板预览"
                        fill
                        className="object-cover"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={() => {
                          setPreviewUrl("");
                          setImageFile(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center border border-dashed rounded-lg p-12">
                      <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground mb-4">
                        上传预览图片
                      </p>
                      <Button asChild variant="secondary">
                        <label>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={handleImageSelect}
                          />
                          选择图片
                        </label>
                      </Button>
                    </div>
                  )}
                  
                  {previewUrl && (
                    <Button asChild variant="outline" className="w-full">
                      <label>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={handleImageSelect}
                        />
                        <Upload className="h-4 w-4 mr-2" />
                        更换图片
                      </label>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-lg font-medium">发布状态</h2>
                
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    当前状态: 
                    <Badge
                      variant={template.status === "published" ? "default" : "outline"}
                      className="ml-2"
                    >
                      {template.status === "published" ? "已发布" : "草稿"}
                    </Badge>
                  </p>
                  
                  <div className="flex gap-2">
                    <Button
                      variant={template.status === "draft" ? "outline" : "default"}
                      className="flex-1"
                      onClick={() => {
                        setTemplate(prev => ({ ...prev, status: "draft" }));
                      }}
                    >
                      草稿
                    </Button>
                    <Button
                      variant={template.status === "published" ? "outline" : "default"}
                      className="flex-1"
                      onClick={() => {
                        setTemplate(prev => ({ ...prev, status: "published" }));
                      }}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      发布
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
} 