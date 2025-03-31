import { MoveRight, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

function Hero() {
  return (
    <div className="w-full py-20 lg:py-40">
      <div className="container mx-auto">
        <div className="grid grid-cols-1 gap-8 items-center md:grid-cols-2">
          <div className="flex gap-4 flex-col">
            <div>
              <Badge variant="outline">全新上线!</Badge>
            </div>
            <div className="flex gap-4 flex-col">
              <h1 className="text-5xl md:text-7xl max-w-lg tracking-tighter text-left font-regular">
                AI赋能，图像创造无限可能
              </h1>
              <p className="text-xl leading-relaxed tracking-tight text-muted-foreground max-w-md text-left">
                用文字描述你想要的画面，AI即刻为你创作精美图像。
                无需专业技能，轻松创造广告素材、社交媒体图片、产品展示、艺术作品等，
                让创意不再受限于技术壁垒。
              </p>
            </div>
            <div className="flex flex-row gap-4">
              <Button size="lg" className="gap-4" variant="outline">
                联系我们 <PhoneCall className="w-4 h-4" />
              </Button>
              <Button size="lg" className="gap-4">
                立即体验 <MoveRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8">
            <div className="bg-muted rounded-md aspect-square relative overflow-hidden">
              <Image 
                src="/images/feat_03.jpeg" 
                alt="AI生成的示例图片1" 
                fill 
                style={{ objectFit: "cover" }}
              />
            </div>
            <div className="bg-muted rounded-md row-span-2 relative overflow-hidden">
              <Image 
                src="/images/feat_04.jpeg" 
                alt="AI生成的示例图片2" 
                fill 
                style={{ objectFit: "cover" }}
              />
            </div>
            <div className="bg-muted rounded-md aspect-square relative overflow-hidden">
              <Image 
                src="/images/feat_05.jpeg" 
                alt="AI生成的示例图片3" 
                fill 
                style={{ objectFit: "cover" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Hero }; 