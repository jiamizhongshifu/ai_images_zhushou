"use client";

import { MoveRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { RetroGrid } from "@/components/ui/retro-grid";

function Hero() {
  // 使用更简单的状态管理
  const [imageStates, setImageStates] = useState({
    image1: { loaded: false, error: false },
    image2: { loaded: false, error: false },
    image3: { loaded: false, error: false }
  });

  // 简化的图片加载处理
  const handleImageLoad = (key: keyof typeof imageStates) => {
    setImageStates(prev => ({
      ...prev,
      [key]: { loaded: true, error: false }
    }));
  };

  const handleImageError = (key: keyof typeof imageStates) => {
    setImageStates(prev => ({
      ...prev,
      [key]: { loaded: false, error: true }
    }));
  };

  return (
    <div className="w-full pt-4 pb-12 lg:pt-8 lg:pb-24 relative">
      <RetroGrid className="opacity-50" />
      <div className="container mx-auto">
        <div className="grid grid-cols-1 gap-8 items-center md:grid-cols-2">
          <div className="flex gap-4 flex-col">
            <div>
              <Badge variant="outline">全新上线!</Badge>
            </div>
            <div className="flex gap-4 flex-col">
              <h1 className="text-5xl md:text-7xl max-w-lg tracking-tighter text-left font-regular">
                IMG图图: <span className="text-primary">AI智能图像创作平台</span>
              </h1>
              <p className="text-xl leading-relaxed tracking-tight text-muted-foreground max-w-md text-left">
                IMG图图让AI图像创作变得简单高效。只需输入文字描述，立即获得专业级图像作品。
                无需设计经验，轻松创建广告素材、社交媒体图片、产品展示和艺术作品，
                让您的创意不再受限。
              </p>
            </div>
            <div className="flex flex-row gap-4 relative z-20">
              <Link href="/sign-in">
                <Button size="lg" className="gap-4 !opacity-100 !bg-primary border-0 font-medium">
                  立即体验IMG图图 <MoveRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 relative">
            {/* 第一个图片 */}
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 rounded-md aspect-square relative overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-10 w-10 text-primary/60" />
              </div>

              <div className="w-full h-full">
                <div className="relative w-full h-full">
                  <Image 
                    src="/images/feat_03.jpeg" 
                    alt="AI生成的风景写实画作"
                    fill
                    className="object-cover w-full h-full"
                    onLoad={() => handleImageLoad('image1')}
                    onError={() => handleImageError('image1')}
                  />
                </div>
              </div>
            </div>

            {/* 第二个图片 */}
            <div className="bg-gradient-to-br from-blue-500/20 to-violet-500/20 rounded-md row-span-2 relative overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-10 w-10 text-blue-500/60" />
              </div>

              <div className="w-full h-full">
                <div className="relative w-full h-full">
                  <Image 
                    src="/images/feat_06.jpg" 
                    alt="AI生成的人物肖像"
                    fill
                    className="object-cover w-full h-full"
                    onLoad={() => handleImageLoad('image2')}
                    onError={() => handleImageError('image2')}
                  />
                </div>
              </div>
            </div>

            {/* 第三个图片 */}
            <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-md aspect-square relative overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-10 w-10 text-amber-500/60" />
              </div>

              <div className="w-full h-full">
                <div className="relative w-full h-full">
                  <Image 
                    src="/images/feat_04.jpeg" 
                    alt="AI生成的抽象艺术"
                    fill
                    className="object-cover w-full h-full"
                    onLoad={() => handleImageLoad('image3')}
                    onError={() => handleImageError('image3')}
                  />
                </div>
              </div>
            </div>
            
            {/* 添加卡通兔子装饰 */}
            <div className="absolute -bottom-16 -right-12 md:-bottom-24 md:-right-16 lg:-bottom-32 lg:-right-24 w-72 h-72 md:w-96 md:h-96 lg:w-[30rem] lg:h-[30rem] z-10 animate-float">
              <Image
                src="/images/cute-rabbit.png"
                alt="卡通兔子装饰"
                width={480}
                height={480}
                className="w-full h-full object-contain drop-shadow-lg"
                style={{ border: 'none', backgroundColor: 'transparent' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Hero }; 