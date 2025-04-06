import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ModelSelectionProps {
  value: string;
  onChange: (value: string) => void;
}

// 简化版的模型数据，假设项目中有这些模型
const SIMPLE_MODELS = [
  { id: "model1", name: "标准模型", disabled: false },
  { id: "model2", name: "高级模型", disabled: false },
  { id: "model3", name: "实验模型", disabled: true }
];

export default function ModelSelection({
  value,
  onChange,
}: ModelSelectionProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground/90 font-quicksand">
        选择模型
      </h3>
      
      <div className="grid grid-cols-2 gap-2">
        {SIMPLE_MODELS.filter(model => !model.disabled).map((model) => (
          <Button
            key={model.id}
            variant={value === model.id ? "default" : "outline"}
            className={`transition-all duration-300 ${
              value === model.id 
                ? "bg-primary text-primary-foreground shadow-ghibli-sm" 
                : "bg-card/80 hover:bg-primary/10 hover:text-primary shadow-ghibli-sm hover:shadow-ghibli"
            }`}
            onClick={() => onChange(model.id)}
          >
            {model.name}
          </Button>
        ))}
      </div>
    </div>
  );
} 