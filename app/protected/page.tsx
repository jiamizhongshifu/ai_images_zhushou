"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, SendHorizontal, PlusCircle, RefreshCw, ImageIcon, Loader2, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProtectedPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState("无风格");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 添加预览状态
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // 处理图片上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // 检查文件大小
    if (file.size > 5 * 1024 * 1024) {
      setError("图片大小不能超过5MB");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  // 生成图片
  const generateImage = async () => {
    if (!prompt.trim()) {
      setError("请输入提示词");
      return;
    }
    
    setError("");
    setIsGenerating(true);
    
    try {
      // 创建完整提示词，包含风格
      let fullPrompt = prompt;
      if (activeStyle !== "无风格") {
        fullPrompt += `，风格：${activeStyle}`;
      }
      
      // 准备API请求数据
      const requestData = {
        prompt: fullPrompt,
        image: uploadedImage || undefined,
        style: activeStyle !== "无风格" ? activeStyle : undefined
      };
      
      // 发送请求到API
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "图片生成失败");
      }
      
      // 将新生成的图片添加到列表中
      if (data.imageUrl) {
        setGeneratedImages(prev => [data.imageUrl, ...prev].slice(0, 4));
      }
    } catch (err: any) {
      console.error("生成图片失败:", err);
      setError(err.message || "生成图片时发生错误");
    } finally {
      setIsGenerating(false);
    }
  };
  
  // 重置对话
  const resetConversation = () => {
    setPrompt("");
    setUploadedImage(null);
    setError("");
    setGeneratedImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  // 处理文件点击上传
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 下载图片函数
  const downloadImage = async (imageUrl: string) => {
    try {
      // 创建一个临时链接
      const link = document.createElement('a');
      link.href = imageUrl;
      
      // 设置文件名 - 从URL中提取或使用默认名称
      // 为了避免跨域问题,可能需要根据你的实际情况调整
      const filename = `generated-image-${new Date().getTime()}.jpg`;
      link.download = filename;
      
      // 模拟点击
      document.body.appendChild(link);
      link.click();
      
      // 清理DOM
      document.body.removeChild(link);
    } catch (error) {
      console.error('下载图片失败:', error);
      setError('下载图片失败，请重试');
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="max-w-7xl w-full px-4 py-8">
        {/* 页面标题 */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-20 h-20 mb-4">
            <div className="absolute inset-0 bg-primary rounded-lg flex items-center justify-center">
              <ImageIcon className="h-10 w-10 text-primary-foreground" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-full h-full bg-muted rounded-lg -z-10 transform translate-x-1 translate-y-1"></div>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">欢迎使用 ChatIMG 图像助手</h1>
          <p className="text-sm text-muted-foreground">上传图片或开始描述您想要生成的图像</p>
        </div>

        {/* 错误信息显示 */}
        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        {/* 风格选择 */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs">🎨</span>
              </div>
              选择艺术风格
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {["无风格", "宫崎骏", "乐高", "皮克斯", "新海诚", "迪士尼", "自定义"].map((style) => (
                <StyleButton 
                  key={style} 
                  label={style} 
                  active={activeStyle === style}
                  onClick={() => setActiveStyle(style)} 
                />
              ))}
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <span>...</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 图片上传与输入区 */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          {/* 图片上传 */}
          <Card className="md:col-span-1 border-dashed">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center h-48 cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleUploadClick}>
              {uploadedImage ? (
                <div className="w-full h-full relative">
                  <img 
                    src={uploadedImage} 
                    alt="上传的图片" 
                    className="w-full h-full object-contain rounded-md"
                  />
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="absolute top-0 right-0 m-1 h-6 w-6 p-0" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedImage(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    &times;
                  </Button>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Upload className="text-primary h-5 w-5" />
                  </div>
                  <p className="font-medium text-sm text-foreground">点击或拖放图片</p>
                  <p className="text-xs text-muted-foreground mt-1">(支持JPEG, PNG, WebP等格式)</p>
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
          
          {/* 输入区 */}
          <div className="md:col-span-4 flex flex-col">
            <Card>
              <CardContent className="p-4">
                <textarea
                  placeholder="描述你想要的图像，或给出编辑指令..."
                  className="w-full px-3 py-2 bg-background border-input rounded-md text-sm resize-none min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isGenerating}
                />
                <div className="flex items-center justify-end pt-3 border-t mt-3 border-border">
                  <div className="flex items-center gap-3">
                    <div className="text-muted-foreground text-sm">
                      <span className="font-medium">5点</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" title="充值点数">
                        <PlusCircle className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button 
                      size="sm" 
                      className="h-8"
                      onClick={generateImage}
                      disabled={isGenerating || !prompt.trim()}
                    >
                      {isGenerating ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <SendHorizontal className="mr-1 h-4 w-4" />
                      )}
                      <span>{isGenerating ? "生成中..." : "生成"}</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-end mt-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs text-muted-foreground" 
                title="重置对话"
                onClick={resetConversation}
                disabled={isGenerating}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                <span>重置对话</span>
              </Button>
            </div>
          </div>
        </div>
        
        {/* 图片展示区 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">生成结果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {isGenerating && generatedImages.length === 0 ? (
                // 生成中的占位骨架图
                <div className="col-span-2 md:col-span-4 aspect-square bg-muted rounded-md relative overflow-hidden animate-pulse">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <p className="text-muted-foreground text-sm absolute mt-16">正在生成图像...</p>
                  </div>
                </div>
              ) : generatedImages.length > 0 ? (
                // 显示已生成的图片
                generatedImages.map((imageUrl, index) => (
                  <div 
                    key={index} 
                    className="aspect-square bg-muted rounded-md relative overflow-hidden group hover:shadow transition-all cursor-pointer" 
                    onClick={() => setPreviewImage(imageUrl)}
                  >
                    <img 
                      src={imageUrl} 
                      alt={`生成的图片 ${index + 1}`} 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex justify-center items-center">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="h-7 text-xs flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation(); // 防止触发父元素的点击事件
                            downloadImage(imageUrl);
                          }}
                        >
                          <Download className="h-3 w-3" />
                          下载
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                // 示例图片
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="aspect-square bg-muted rounded-md relative overflow-hidden group hover:shadow transition-all">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-full h-full bg-gradient-to-br from-primary/5 to-secondary/10 flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">示例图片 {index + 1}</p>
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex justify-center items-center">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="h-7 text-xs flex items-center gap-1"
                        >
                          <Download className="h-3 w-3" />
                          下载
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
          <CardFooter className="text-center border-t pt-4">
            <p className="text-muted-foreground text-xs w-full">提示：尝试详细描述您想要的图像，包含更多细节可以获得更好的结果</p>
          </CardFooter>
        </Card>
      </div>
      
      {/* 图片预览模态框 */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <div className="absolute -top-12 right-0 flex justify-end">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 rounded-full bg-background/20 text-white hover:bg-background/40"
                onClick={() => setPreviewImage(null)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="bg-card rounded-lg overflow-hidden shadow-2xl">
              <div className="relative aspect-square sm:aspect-video max-h-[80vh]">
                <img 
                  src={previewImage} 
                  alt="预览图片" 
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 风格按钮组件
function StyleButton({ 
  label, 
  active = false,
  onClick 
}: { 
  label: string; 
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button 
      variant={active ? "default" : "outline"} 
      size="sm"
      className="h-8"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
