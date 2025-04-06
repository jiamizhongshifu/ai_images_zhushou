"use client";

import Link from "next/link";
import { Button } from "./button";
import { ImageComparisonSlider } from "./image-comparison-slider";

export function TransformationExamples() {
  const examples = [
    {
      id: 1,
      beforeImage: "/examples/disney.webp",
      afterImage: "/examples/ghibli.webp",
    },
    {
      id: 2,
      beforeImage: "/examples/snoopy.webp",
      afterImage: "/examples/pixar.webp",
    },
    {
      id: 3,
      beforeImage: "/examples/shinkai.webp",
      afterImage: "/examples/lego.webp",
    },
    {
      id: 4,
      beforeImage: "/examples/3d.webp",
      afterImage: "/examples/senyouhui.webp",
    },
    {
      id: 5,
      beforeImage: "/examples/pailide.webp",
      afterImage: "/examples/custom.webp",
    },
    {
      id: 6,
      beforeImage: "/examples/disney.webp",
      afterImage: "/examples/shinkai.webp",
    }
  ];

  return (
    <div className="w-full py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold tracking-tighter mb-4">效果转换案例</h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            查看神奇的图像转换过程。这些案例展示了如何将普通照片转化为迷人的动画风格艺术作品。
            拖动滑块对比转换前后的效果。
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {examples.map((example) => (
            <div key={example.id} className="bg-card rounded-xl overflow-hidden p-3 shadow-sm">
              <div className="aspect-square">
                <ImageComparisonSlider 
                  beforeImage={example.beforeImage} 
                  afterImage={example.afterImage}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <Link href="/sign-in">
            <Button size="lg" className="text-base px-10 py-6 h-auto">
              立即体验图片转换
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
} 