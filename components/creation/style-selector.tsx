import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import StyleCard from "@/components/creation/style-card";
import { STYLE_CONFIGS } from "@/app/config/styles";

interface StyleSelectorProps {
  activeStyle: string;
  onStyleChange: (styleId: string) => void;
}

export default function StyleSelector({
  activeStyle,
  onStyleChange,
}: StyleSelectorProps) {
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);
  const [showScrollControls, setShowScrollControls] = useState(false);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(true);

  const checkScrollPosition = () => {
    if (!scrollAreaRef.current) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollAreaRef.current;
    const maxScroll = scrollWidth - clientWidth;
    
    setShowLeftScroll(scrollLeft > 10);
    setShowRightScroll(scrollLeft < maxScroll - 10);
  };

  React.useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;
    
    const handleScroll = () => checkScrollPosition();
    const handleResize = () => {
      checkScrollPosition();
      setShowScrollControls(scrollArea.scrollWidth > scrollArea.clientWidth);
    };
    
    handleResize();
    scrollArea.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);
    
    return () => {
      scrollArea.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // 向左滚动
  const scrollLeft = () => {
    if (!scrollAreaRef.current) return;
    scrollAreaRef.current.scrollBy({ left: -320, behavior: "smooth" });
  };
  
  // 向右滚动
  const scrollRight = () => {
    if (!scrollAreaRef.current) return;
    scrollAreaRef.current.scrollBy({ left: 320, behavior: "smooth" });
  };

  return (
    <div className="relative space-y-3">
      <h3 className="text-base font-medium font-quicksand text-foreground/90">
        选择风格
      </h3>
      
      <div className="relative group">
        <div
          ref={scrollAreaRef}
          className="grid grid-flow-col auto-cols-max gap-3 overflow-x-auto hide-scrollbar overscroll-x-contain snap-x snap-mandatory pb-2 scroll-pl-6"
        >
          {STYLE_CONFIGS.map((style) => (
            <div key={style.id} className="snap-start min-w-[140px] sm:min-w-[150px]">
              <StyleCard
                style={style}
                isActive={activeStyle === style.id}
                onClick={() => onStyleChange(style.id)}
              />
            </div>
          ))}
        </div>
        
        {/* 滚动控制按钮 */}
        {showScrollControls && (
          <>
            {showLeftScroll && (
              <Button
                size="icon" 
                variant="outline"
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-8 w-8 rounded-full shadow-ghibli-sm hover:shadow-ghibli bg-card/90 backdrop-blur-sm z-10 border-border hover:border-primary/50 transition-all duration-300"
                onClick={scrollLeft}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            
            {showRightScroll && (
              <Button
                size="icon" 
                variant="outline"
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-8 w-8 rounded-full shadow-ghibli-sm hover:shadow-ghibli bg-card/90 backdrop-blur-sm z-10 border-border hover:border-primary/50 transition-all duration-300"
                onClick={scrollRight}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
        
        {/* 渐变边缘指示器 */}
        {showLeftScroll && (
          <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-background to-transparent pointer-events-none z-[5]"></div>
        )}
        
        {showRightScroll && (
          <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-background to-transparent pointer-events-none z-[5]"></div>
        )}
      </div>
      
      <style jsx global>{`
        .hide-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
} 