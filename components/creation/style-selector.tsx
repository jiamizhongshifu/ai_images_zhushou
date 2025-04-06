import React from "react";
import { STYLE_CONFIGS, StyleConfig } from "@/app/config/styles";
import StyleCard from "./style-card";

interface StyleSelectorProps {
  activeStyle: string;
  onStyleChange: (styleId: string) => void;
}

export default function StyleSelector({
  activeStyle,
  onStyleChange
}: StyleSelectorProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">选择风格</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {STYLE_CONFIGS.map((style) => (
          <StyleCard
            key={style.id}
            style={style}
            isActive={activeStyle === style.id}
            onClick={() => onStyleChange(style.id)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        提示：选择合适的风格可以大幅提升出图效果
      </p>
    </div>
  );
} 