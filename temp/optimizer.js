#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const filePath = path.join(__dirname, "../components/creation/generated-image-gallery.tsx");
const backupPath = path.join(__dirname, "../components/creation/generated-image-gallery.tsx.bak");
try {
  const content = fs.readFileSync(filePath, "utf8");
  fs.writeFileSync(backupPath, content, "utf8");
  console.log("已创建备份文件:",backupPath);
  const prepareGridItemsFunction = `// 准备网格项，骨架屏优先，然后是图片
  const prepareGridItems = () => {
    const gridItems = [];
    
    // 添加骨架屏作为第一个元素
    if (shouldShowSkeleton) {
      gridItems.push(
        <div key="generation-skeleton" className="col-span-1 animate-fade-in">
          <ImageGenerationSkeleton 
            isGenerating={isGenerating}
            stage={generationStage}
            percentage={generationPercentage}
            onStageChange={onStageChange}
          />
        </div>
      );
    }
    
    // 添加所有图片（不跳过任何图片）
    images.forEach((imageUrl, index) => {
      gridItems.push(
        <div
          key={\`\${imageUrl}-\${index}\`}
          className="ghibli-image-container aspect-square relative overflow-hidden rounded-xl border border-border/40 cursor-pointer shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300 hover:border-border/60 animate-fade-in"
          onClick={() => setPreviewImage(imageUrl)}
        >
          {/* 图片加载中状态 */}
          {!loadedImages[imageUrl] && !errorImages[imageUrl] && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/60 backdrop-blur-sm z-10">
              <ImageLoading message="加载中..." />
            </div>
          )}
          
          {/* 图片加载错误状态 */}
          {errorImages[imageUrl] && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/60 backdrop-blur-sm z-10">
              <ImageError message="加载失败" />
            </div>
          )}
          
          <div className="w-full h-full relative">
            <LazyImage
              src={imageUrl}
              alt={\`生成的图片 \${index + 1}\`}
              className="object-cover w-full h-full transition-transform duration-700 hover:scale-[1.05]"
              onImageLoad={() => handleImageLoad(imageUrl)}
              onImageError={() => handleImageError(imageUrl)}
              fadeIn={true}
              blurEffect={true}
            />
          </div>
          
          {/* 图片操作按钮 - 鼠标悬停时显示 */}
          <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white shadow-ghibli-sm backdrop-blur-sm"
              onClick={(e) => {
                e.stopPropagation();
                onDownloadImage(imageUrl);
              }}
              title="下载"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            
            {onDeleteImage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-destructive/40 hover:bg-destructive/60 text-white shadow-ghibli-sm backdrop-blur-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteImage(imageUrl);
                }}
                title="删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      );
    });
    
    // 根据maxRows限制返回适当数量的项
    if (maxRows) {
      const itemsPerRow = isLargerSize ? 3 : 4;
      const maxItems = maxRows * itemsPerRow;
      return gridItems.slice(0, maxItems);
    }
    
    return gridItems;
  };
`;
  const newRenderCode = `        {/* 根据准备好的排列显示骨架屏+图片网格 */}
        {(!isLoading || shouldShowSkeleton) && (images.length > 0 || shouldShowSkeleton) && 
          prepareGridItems()
        }`;
  let updatedContent = content.replace(/const shouldShowSkeleton = isGenerating;/, "const shouldShowSkeleton = isGenerating;
" + prepareGridItemsFunction);
  updatedContent = updatedContent.replace(/{\/\* 图片网格.+?\){3}}/s, newRenderCode);
  fs.writeFileSync(filePath, updatedContent, "utf8");
  console.log("文件已成功更新！");
} catch (err) {
  console.error("错误:", err);
}
