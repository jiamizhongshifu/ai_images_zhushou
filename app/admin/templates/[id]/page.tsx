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
} from "../../ui/switch";
import { 
  Card, 
  CardContent 
} from "@/components/ui/card";
import { toast } from "react-hot-toast";

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
  
  // 表单数据
  const [template, setTemplate] = useState<Template>({
    id: "",
    name: "",
    description: "",
    preview_image: "",
    requires_image: false,
    prompt_required: true,
    prompt_guide: "",
    prompt_placeholder: "请输入你的创意描述...",
    base_prompt: "",
    tags: [],
    status: "published",
    style_id: null
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
      console.log('正在获取模板数据:', templateId);
      const response = await fetch(`/api/templates/${templateId}`);
      
      if (!response.ok) {
        console.error('获取模板失败:', {
          status: response.status,
          statusText: response.statusText
        });
        
        const errorData = await response.json().catch(() => null);
        console.error('错误详情:', errorData);
        
        throw new Error(
          errorData?.error || 
          `获取模板失败 (HTTP ${response.status}: ${response.statusText})`
        );
      }
      
      const data = await response.json();
      console.log('获取到的模板数据:', data);
      
      if (data.success) {
        setTemplate(data.data);
        // 如果有预览图片，设置预览URL
        if (data.data.preview_image) {
          setPreviewUrl(data.data.preview_image);
        }
      } else {
        throw new Error(data.error || "获取模板数据失败");
      }
    } catch (err) {
      console.error("获取模板数据错误:", err);
      const errorMessage = err instanceof Error 
        ? err.message 
        : "获取模板数据失败，请检查网络连接或刷新页面重试";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 初始加载
  useEffect(() => {
    fetchTemplateData();
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
    console.log(`选择${name}改变为:`, value);
    
    // 对于风格ID，确保"null"字符串被转换为null值
    if (name === "style_id") {
      setTemplate(prev => ({ 
        ...prev, 
        [name]: value === "null" ? null : value 
      }));
    } else {
      setTemplate(prev => ({ ...prev, [name]: value }));
    }
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
        const previewImageUrl = reader.result as string;
        setPreviewUrl(previewImageUrl);
        // 清除template中的preview_image，因为我们将使用新上传的图片
        setTemplate(prev => ({
          ...prev,
          preview_image: ""
        }));
      };
      reader.readAsDataURL(file);
    }
  };
  
  // 处理图片删除
  const handleImageDelete = () => {
    setPreviewUrl("");
    setImageFile(null);
    setTemplate(prev => ({
      ...prev,
      preview_image: ""
    }));
  };
  
  // 处理删除
  const handleDelete = async () => {
    if (!confirm("确定要删除此模板吗？此操作不可撤销。")) {
      return;
    }
    
    try {
      setIsSaving(true);
      setError(null);
      
      const response = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE"
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `删除失败 (HTTP ${response.status})`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "删除模板失败");
      }
      
      toast.success("模板已成功删除");
      router.push("/admin/templates");
    } catch (err) {
      console.error("删除模板失败:", err);
      setError(err instanceof Error ? err.message : "删除模板失败");
    } finally {
      setIsSaving(false);
    }
  };
  
  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('提交表单:', {
      isNewTemplate,
      imageFile: !!imageFile,
      previewUrl,
      templatePreviewImage: template.preview_image
    });
    
    // 表单验证
    if (!template.name.trim()) {
      setError("请输入模板名称");
      return;
    }
    
    if (!template.description.trim()) {
      setError("请输入模板描述");
      return;
    }
    
    // 修改图片验证逻辑：如果是编辑模式且已有预览图，则不需要新上传
    if (!isNewTemplate && !imageFile && !previewUrl && !template.preview_image) {
      setError("请上传预览图片");
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      // 准备要发送的数据
      const templateData = {
        ...template,
        // 如果是新建或有新上传的图片，先不发送图片数据
        preview_image: imageFile ? '' : (previewUrl || template.preview_image)
      };
      
      // 调用API创建或更新模板
      const url = isNewTemplate ? "/api/templates" : `/api/templates/${templateId}`;
      const method = isNewTemplate ? "POST" : "PUT";
      
      console.log('发送请求:', {
        url,
        method,
        templateData
      });
      
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(templateData)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "保存模板失败");
      }
      
      const savedTemplateId = data.data.id;
      console.log('模板保存成功:', savedTemplateId);
      
      // 如果有新上传的图片，需要单独处理图片上传
      if (imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);
        
        console.log('开始上传图片:', {
          templateId: savedTemplateId,
          imageType: imageFile.type,
          imageSize: imageFile.size
        });
        
        // 确保使用保存后的模板ID，并等待一段时间确保模板已创建
        if (isNewTemplate) {
          console.log('等待模板创建完成...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // 添加重试机制
        let retryCount = 0;
        const maxRetries = 3;
        const retryDelay = 2000; // 2秒的重试延迟
        
        while (retryCount < maxRetries) {
          try {
            const uploadResponse = await fetch(`/api/templates/${savedTemplateId}/upload-preview`, {
              method: 'POST',
              body: formData
            });
            
            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json().catch(() => null);
              throw new Error(errorData?.error || `上传失败 (HTTP ${uploadResponse.status})`);
            }
            
            const uploadData = await uploadResponse.json();
            
            if (!uploadData.success) {
              throw new Error(uploadData.error || "上传预览图片失败");
            }
            
            console.log('图片上传成功');
            break;
          } catch (error) {
            console.error('上传过程出错:', error);
            if (retryCount === maxRetries - 1) {
              throw error;
            }
            console.log(`第${retryCount + 1}次尝试失败，等待后重试...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryCount++;
          }
        }
      }
      
      // 如果是新建模板，跳转到编辑页面
      if (isNewTemplate) {
        toast.success(`模板创建成功! ID: ${savedTemplateId}`);
        // 添加时间戳参数，确保返回列表页面时不使用缓存数据
        router.push(`/admin/templates?t=${Date.now()}`);
      } else {
        toast.success(`模板保存成功! ID: ${savedTemplateId}`);
        // 刷新页面以显示最新数据
        fetchTemplateData();
      }
      
    } catch (err) {
      console.error("保存模板错误:", err);
      setError(err instanceof Error ? err.message : "保存模板失败");
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
                  <div className="mb-2">
                    <p className="text-xs text-muted-foreground mb-2">
                      您可以通过在基础提示词中添加 <code className="bg-muted rounded px-1">{"{user_prompt}"}</code> 来指定用户输入提示词的位置。
                      不添加占位符时，用户提示词会默认添加在基础提示词之前。
                    </p>
                  </div>
                  <Textarea
                    id="base_prompt"
                    name="base_prompt"
                    value={template.base_prompt}
                    onChange={handleInputChange}
                    placeholder="输入基础提示词，例如：a photo of {user_prompt}, high quality, detailed"
                    rows={4}
                  />
                  <div className="mt-2 p-3 bg-muted/30 rounded text-sm">
                    <p className="font-medium mb-1">预览效果：</p>
                    <p className="text-muted-foreground text-xs">
                      {template.base_prompt.includes("{user_prompt}") 
                        ? template.base_prompt.replace("{user_prompt}", "<用户输入的提示词>") 
                        : "<用户输入的提示词> " + template.base_prompt}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
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
                        onClick={handleImageDelete}
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
                <h2 className="text-lg font-medium">操作</h2>
                
                <div className="space-y-4">
                  {isNewTemplate ? (
                    // 新建模式：显示发布状态和发布按钮
                    <>
                      <div className="flex items-center text-sm text-muted-foreground">
                        <span>当前状态:</span>
                        <Badge
                          variant={template.status === "published" ? "default" : "outline"}
                          className="ml-2"
                        >
                          {template.status === "published" ? "已发布" : "草稿"}
                        </Badge>
                      </div>
                      
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
                          variant="default"
                          className="flex-1"
                          onClick={handleSubmit}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <span className="flex items-center gap-2">
                              <div className="h-4 w-4 border-2 border-current border-t-transparent animate-spin rounded-full"></div>
                              创建中...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Sparkles className="h-4 w-4 mr-2" />
                              创建并发布
                            </span>
                          )}
                        </Button>
                      </div>
                    </>
                  ) : (
                    // 编辑模式：显示保存和删除按钮
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        className="flex-1"
                        onClick={handleSubmit}
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
                            保存更改
                          </span>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <span className="flex items-center gap-2">
                            <div className="h-4 w-4 border-2 border-current border-t-transparent animate-spin rounded-full"></div>
                            删除中...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Trash className="h-4 w-4" />
                            删除模板
                          </span>
                        )}
                      </Button>
                    </div>
                  )}
                  
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push("/admin/templates")}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    返回列表
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
} 