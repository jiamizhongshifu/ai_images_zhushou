import React from "react";
import Link from "next/link";
import Image from "next/image";
import { BarChart2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export interface TemplateCardProps {
  template: {
    id: string;
    name: string;
    description: string;
    preview_image: string;
    tags: string[];
    use_count: number;
    requires_image: boolean;
  };
}

export function TemplateCard({ template }: TemplateCardProps) {
  return (
    <Card className="mb-6 overflow-hidden hover:shadow-ghibli transition-all duration-300 border-border/40 group">
      <Link href={`/creative-plaza/template/${template.id}`} className="block">
        <div className="relative">
          <div className="aspect-[4/3] w-full relative">
            <Image 
              src={template.preview_image}
              alt={template.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
          
          {/* 必要条件标签 */}
          {template.requires_image && (
            <Badge 
              variant="secondary" 
              className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm text-xs"
            >
              需上传图片
            </Badge>
          )}
        </div>
        
        <div className="p-4">
          <h3 className="font-medium text-lg mb-1 group-hover:text-primary transition-colors duration-300">
            {template.name}
          </h3>
          
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3 h-10">
            {template.description}
          </p>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center text-sm text-muted-foreground">
              <BarChart2 className="h-4 w-4 mr-1" />
              <span>{template.use_count || 0} 次使用</span>
            </div>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs p-0 h-auto hover:bg-transparent hover:text-primary"
              asChild
            >
              <Link href={`/creative-plaza/template/${template.id}`}>
                立即使用 <ChevronRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          
          {template.tags && template.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {template.tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="outline" className="text-xs font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
} 