import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "动物森友会风格AI图片生成 | IMG图图(imgtutu)专业工具",
  description: "使用IMG图图(imgtutu)一键生成动物森友会风格的AI图像，还原可爱的小动物居民、清新的岛屿场景和梦幻的四季变化，简单易用的AI绘画工具。",
};

export default function AnimalCrossingPage() {
  return (
    <div className="container mx-auto py-12 px-4">
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-4">动物森友会风格AI图片生成</h1>
          <p className="text-xl text-muted-foreground">
            使用IMG图图(imgtutu)轻松创作动物森友会风格的精美图像
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-semibold mb-4">还原动物森友会独特的艺术风格</h2>
            <p className="mb-4">动物森友会(Animal Crossing)以其清新可爱的艺术风格、丰富多彩的场景设计和温馨治愈的氛围而广受喜爱。现在，通过IMG图图(imgtutu)的AI图片生成技术，您可以轻松创作出动物森友会风格的精美图像。</p>
            <p className="mb-6">无论是可爱的动物居民、精致的岛屿景观、四季变化的自然风光，还是温馨的室内装饰场景，我们的AI都能准确捕捉动物森友会的视觉风格，帮助您创作出充满童趣与治愈感的图像作品。</p>
            <Link href="/sign-in">
              <Button size="lg">立即体验动物森友会风格图片生成</Button>
            </Link>
          </div>
          <div className="relative aspect-square rounded-lg overflow-hidden">
            <Image
              src="/examples/senyouhui.jpg"
              alt="动物森友会风格AI生成图片示例"
              fill
              className="object-cover"
            />
          </div>
        </div>
        
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">动物森友会风格特点</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">圆润可爱的角色设计</h3>
              <p>大头小身的角色比例、圆润的线条和鲜明的色彩是动物森友会角色设计的核心特点。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">四季分明的自然环境</h3>
              <p>春花秋月、夏阳冬雪，动物森友会中四季分明的自然变化创造出丰富多样的视觉体验。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">温馨治愈的生活场景</h3>
              <p>精致的家居摆设、惬意的户外活动和丰富的社交互动，营造出治愈舒适的生活氛围。</p>
            </div>
          </div>
        </div>
        
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">常见问题</h2>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">IMG图图如何实现动物森友会风格的图片生成？</h3>
              <p>我们的AI模型经过大量动物森友会游戏素材和艺术作品的训练，能够准确识别和复现其艺术风格的关键元素，包括色彩运用、角色设计和环境构建。</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">如何得到最好的动物森友会风格图片效果？</h3>
              <p>建议在提示词中加入具体的动物森友会元素，如"动物森友会风格的小动物"、"四季岛屿场景"或"森友会室内装饰"等，同时指定明亮的色彩和可爱的画风，这样能获得更符合期望的结果。</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">除了动物森友会风格，还支持哪些相似风格？</h3>
              <p>我们还支持<Link href="/styles/ghibli" className="text-primary hover:underline">吉卜力工作室</Link>和<Link href="/styles/shinkai" className="text-primary hover:underline">新海诚</Link>等风格，以及其他多种游戏和动漫风格，您可以尝试不同风格创作多样化的作品。</p>
            </div>
          </div>
        </div>
        
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-semibold mb-6">开始创作您的动物森友会风格图像</h2>
          <p className="mb-6 max-w-2xl mx-auto">无论您是游戏爱好者、内容创作者，还是设计师，IMG图图都能帮助您轻松创作出动物森友会风格的精美图像，为您的创意项目增添独特魅力。</p>
          <Link href="/sign-in">
            <Button size="lg" className="mx-auto">立即开始创作</Button>
          </Link>
        </div>
      </div>
    </div>
  );
} 