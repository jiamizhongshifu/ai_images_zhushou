"use client";

import Link from "next/link";
import { Button } from "./button";
import { ImageComparisonSlider } from "./image-comparison-slider";

export function TransformationExamples() {
  const examples = [
    {
      id: 1,
      beforeImage: "/examples/before-2.webp",
      afterImage: "/examples/after-2.webp",
      title: "吉卜力风格"
    },
    {
      id: 2,
      beforeImage: "/examples/before-3.webp",
      afterImage: "/examples/after-3.png",
      title: "史努比风格"
    },
    {
      id: 3,
      beforeImage: "/examples/before-1.jpg",
      afterImage: "/examples/after-1.png",
      title: "乐高风格"
    },
    {
      id: 4,
      beforeImage: "/examples/before-4.jpg",
      afterImage: "/examples/after-4.png",
      title: "新海诚风格"
    },
    {
      id: 5,
      beforeImage: "/examples/before-5.jpg",
      afterImage: "/examples/after-5.png",
      title: "迪士尼风格"
    },
    {
      id: 6,
      beforeImage: "/examples/before-6.jpg",
      afterImage: "/examples/after-6.png",
      title: "动物森友会风格"
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
            <div key={example.id} className="rounded-xl overflow-hidden shadow-sm">
              <div className="aspect-video">
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