import React from "react";
import Masonry from "react-masonry-css";
import { TemplateCard, TemplateCardProps } from "./template-card";
import { Loader2 } from "lucide-react";

export interface TemplateGridProps {
  templates: TemplateCardProps["template"][];
  isLoading?: boolean;
}

export function TemplateGrid({ templates, isLoading = false }: TemplateGridProps) {
  // 根据屏幕尺寸定义不同的列数
  const breakpointColumns = {
    default: 4, // 默认显示4列
    1440: 3,    // 1440px以下显示3列
    1024: 3,    // 1024px以下显示3列
    768: 2,     // 768px以下显示2列
    640: 1      // 640px以下显示1列
  };

  if (isLoading) {
    return (
      <div className="w-full flex justify-center items-center py-16">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">加载模板中...</p>
        </div>
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="w-full flex justify-center items-center py-16 border rounded-lg bg-card/50">
        <div className="text-center">
          <p className="text-lg font-medium">暂无可用模板</p>
          <p className="text-muted-foreground mt-1">请稍后再查看</p>
        </div>
      </div>
    );
  }

  return (
    <Masonry
      breakpointCols={breakpointColumns}
      className="flex w-auto -ml-4"
      columnClassName="pl-4 bg-clip-padding"
    >
      {templates.map(template => (
        <TemplateCard key={template.id} template={template} />
      ))}
    </Masonry>
  );
} 