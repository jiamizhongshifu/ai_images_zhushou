import React from 'react';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImagePreviewModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  onClose: () => void;
  onDownload?: (url: string) => void;
  onDelete?: (url: string) => void;
}

export function ImagePreviewModal({ isOpen, imageUrl, onClose, onDownload, onDelete }: ImagePreviewModalProps) {
  if (!isOpen || !imageUrl) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] w-full animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <div className="absolute -top-12 right-0 flex justify-end">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 rounded-full bg-background/20 text-white hover:bg-background/40 backdrop-blur-sm"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        {/* 图片预览 */}
        <div className="bg-card/95 backdrop-blur-md rounded-xl overflow-hidden shadow-ghibli border border-border/50">
          <div className="relative aspect-auto max-h-[80vh] flex items-center justify-center p-4">
            <img 
              src={imageUrl} 
              alt="预览图片"
              className="max-w-full max-h-[70vh] object-contain"
            />
          </div>
          
          {/* 图片操作栏 */}
          <div className="p-4 flex justify-between items-center border-t border-border/50">
            <div className="truncate text-sm text-muted-foreground font-quicksand">
              预览图片
            </div>
            
            <div className="flex gap-2">
              {onDelete && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
                  onClick={() => onDelete(imageUrl)}
                >
                  <span>删除</span>
                </Button>
              )}
            {onDownload && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-ghibli-sm hover:shadow-ghibli transition-all duration-300"
                  onClick={() => onDownload(imageUrl)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  <span>下载</span>
                </Button>
              )}
              </div>
          </div>
        </div>
      </div>
    </div>
  );
} 