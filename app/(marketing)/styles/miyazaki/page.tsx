import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "宫崎骏风格AI图片生成 | IMG图图(imgtutu)专业工具",
  description: "使用IMG图图(imgtutu)一键生成宫崎骏风格的AI图像，还原龙猫、千与千寻等经典作品风格，简单易用的AI绘画工具。",
};

export default function MiyazakiPage() {
  return (
    <div className="container mx-auto py-12 px-4">
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-4">宫崎骏风格AI图片生成</h1>
          <p className="text-xl text-muted-foreground">
            使用IMG图图(imgtutu)轻松创作宫崎骏风格的精美图像
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-semibold mb-4">还原宫崎骏独特的艺术风格</h2>
            <p className="mb-4">宫崎骏的作品以独特的艺术风格、细腻的场景描绘和温暖人心的故事而闻名于世。现在，通过IMG图图(imgtutu)的AI图片生成技术，您可以轻松创作出宫崎骏风格的精美图像。</p>
            <p className="mb-6">无论是梦幻的自然景观、奇幻的角色设定，还是温馨的场景氛围，我们的AI都能准确捕捉宫崎骏作品的精髓，帮助您创作出充满魔力的图像作品。</p>
            <Link href="/sign-in">
              <Button size="lg">立即体验宫崎骏风格图片生成</Button>
            </Link>
          </div>
          <div className="relative aspect-square rounded-lg overflow-hidden">
            <Image
              src="/images/feat_06.jpg"
              alt="宫崎骏风格AI生成图片示例"
              fill
              className="object-cover"
            />
          </div>
        </div>
        
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">宫崎骏风格特点</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">自然与环保主题</h3>
              <p>宫崎骏作品中常有对自然环境的关注，以及人与自然和谐相处的理念。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">奇幻元素</h3>
              <p>独特的奇幻生物、会飞行的交通工具以及魔法元素是宫崎骏作品的标志。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">人物刻画</h3>
              <p>丰富的人物表情、复杂的人物关系，以及成长主题是宫崎骏电影的核心。</p>
            </div>
          </div>
        </div>
        
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">常见问题</h2>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">IMG图图如何实现宫崎骏风格的图片生成？</h3>
              <p>我们的AI模型经过大量宫崎骏作品的训练，能够准确识别和复现其艺术风格的关键元素，包括色彩运用、线条特点和场景构图。</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">如何得到最好的宫崎骏风格图片效果？</h3>
              <p>建议在提示词中加入具体的宫崎骏作品元素，如"龙猫风格"、"天空之城场景"或"千与千寻氛围"等，这样能获得更符合期望的结果。</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">除了宫崎骏风格，还支持哪些相似风格？</h3>
              <p>我们还支持<Link href="/styles/ghibli" className="text-primary hover:underline">吉卜力工作室</Link>和<Link href="/styles/shinkai" className="text-primary hover:underline">新海诚</Link>等风格，您可以尝试不同风格创作多样化的作品。</p>
            </div>
          </div>
        </div>
        
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-semibold mb-6">开始创作您的宫崎骏风格图像</h2>
          <p className="mb-6 max-w-2xl mx-auto">无论您是动漫爱好者、内容创作者，还是设计师，IMG图图都能帮助您轻松创作出宫崎骏风格的精美图像。</p>
          <Link href="/sign-in">
            <Button size="lg" className="mx-auto">立即开始创作</Button>
          </Link>
        </div>
      </div>
    </div>
  );
} 