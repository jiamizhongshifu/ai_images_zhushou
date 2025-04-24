import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "吉卜力风格AI图片生成 | IMG图图(imgtutu)专业工具",
  description: "使用IMG图图(imgtutu)一键生成吉卜力风格的AI图像，还原宫崎骏经典作品的艺术风格，简单易用的AI绘画工具。",
};

export default function GhibliPage() {
  return (
    <div className="container mx-auto py-12 px-4">
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-4">吉卜力风格AI图片生成</h1>
          <p className="text-xl text-muted-foreground">
            使用IMG图图(imgtutu)轻松创作吉卜力工作室风格的精美图像
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-semibold mb-4">还原吉卜力独特的艺术风格</h2>
            <p className="mb-4">吉卜力工作室的作品以精美的手绘动画、丰富的想象力和温暖的人文关怀著称。现在，通过IMG图图(imgtutu)的AI图片生成技术，您可以轻松创作出吉卜力风格的精美图像。</p>
            <p className="mb-6">无论是宫崎骏标志性的自然景观、奇幻生物，还是温馨的人物互动场景，我们的AI都能准确捕捉吉卜力作品的精髓，帮助您创作出充满魔力的图像作品。</p>
            <Link href="/sign-in">
              <Button size="lg">立即体验吉卜力风格图片生成</Button>
            </Link>
          </div>
          <div className="relative aspect-square rounded-lg overflow-hidden">
            <Image
              src="/images/feat_05.jpeg"
              alt="吉卜力风格AI生成图片示例"
              fill
              className="object-cover"
            />
          </div>
        </div>
        
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">为什么选择IMG图图生成吉卜力风格图片？</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">精准还原风格</h3>
              <p>我们的AI模型经过专门训练，能够准确捕捉吉卜力作品的线条、色彩和氛围特点。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">简单易用</h3>
              <p>无需专业设计经验，只需输入文字描述，即可获得高质量的吉卜力风格图像。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">多种用途</h3>
              <p>生成的图片可用于个人创作、社交媒体、内容创作、教育材料等多种用途。</p>
            </div>
          </div>
        </div>
        
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">常见问题</h2>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">如何使用IMG图图(imgtutu)生成吉卜力风格的图片？</h3>
              <p>只需注册登录账号，选择"吉卜力"风格预设，输入您想要的场景描述，AI将为您生成符合吉卜力风格的精美图像。</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">生成的吉卜力风格图片有版权问题吗？</h3>
              <p>IMG图图生成的是AI创作的原创图像，采用吉卜力的风格特点，而非复制具体作品。您可以放心用于个人和商业项目。</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">除了吉卜力风格，还支持其他动画风格吗？</h3>
              <p>是的，IMG图图还支持宫崎骏、新海诚等多种动画风格，您可以在我们的<Link href="/styles/miyazaki" className="text-primary hover:underline">宫崎骏风格</Link>和<Link href="/styles/shinkai" className="text-primary hover:underline">新海诚风格</Link>页面了解更多。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 