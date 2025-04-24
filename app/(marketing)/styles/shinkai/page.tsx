import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "新海诚风格AI图片生成 | IMG图图(imgtutu)专业工具",
  description: "使用IMG图图(imgtutu)一键生成新海诚风格的AI图像，还原《你的名字》《天气之子》等经典作品的唯美画面，专业的AI绘画工具。",
};

export default function ShinkaiPage() {
  return (
    <div className="container mx-auto py-12 px-4">
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-4">新海诚风格AI图片生成</h1>
          <p className="text-xl text-muted-foreground">
            使用IMG图图(imgtutu)轻松创作新海诚风格的唯美图像
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-semibold mb-4">完美再现新海诚的光影美学</h2>
            <p className="mb-4">新海诚作品以令人惊叹的光影效果、细腻的场景描绘和浪漫的氛围著称。现在，通过IMG图图(imgtutu)的AI图片生成技术，您可以轻松创作出新海诚风格的唯美图像。</p>
            <p className="mb-6">无论是绚丽的天空、细腻的雨景，还是城市与自然的交融场景，我们的AI都能准确捕捉新海诚作品的视觉风格，帮助您创作出充满诗意的图像作品。</p>
            <Link href="/sign-in">
              <Button size="lg">立即体验新海诚风格图片生成</Button>
            </Link>
          </div>
          <div className="relative aspect-square rounded-lg overflow-hidden">
            <Image
              src="/examples/shinkai.jpg"
              alt="新海诚风格AI生成图片示例"
              fill
              className="object-cover"
            />
          </div>
        </div>
        
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">新海诚风格特点</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">震撼光影效果</h3>
              <p>光线的穿透、反射和折射效果是新海诚作品的标志性特点，创造出梦幻而真实的视觉体验。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">精细的细节刻画</h3>
              <p>从云彩的层次到城市的街景，新海诚作品中的每一个细节都精心设计，营造出极具沉浸感的场景。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">情感化的色彩运用</h3>
              <p>色彩不仅仅是视觉元素，更是情感的载体，新海诚擅长用色彩表达人物的内心世界。</p>
            </div>
          </div>
        </div>
        
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">应用场景</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">个人创作</h3>
              <p>为您的小说、漫画或视频创作新海诚风格的配图，增强作品的视觉吸引力。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">商业设计</h3>
              <p>为广告、产品宣传或品牌形象创作新海诚风格的图像，打造独特的视觉风格。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">社交媒体</h3>
              <p>创作新海诚风格的图像用于个人社交媒体，吸引更多关注和互动。</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-medium text-lg mb-2">教育与展示</h3>
              <p>为教育内容或展示项目创作新海诚风格的图像，增强视觉效果和教学效果。</p>
            </div>
          </div>
        </div>
        
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">常见问题</h2>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">如何获得最佳的新海诚风格效果？</h3>
              <p>在提示词中可以加入"新海诚风格"、"你的名字场景"、"天气之子风格"等具体描述，并提及光影效果、天空、城市景观等新海诚作品中常见的元素。</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">生成的图片可以商用吗？</h3>
              <p>是的，IMG图图生成的新海诚风格图片可用于商业用途，我们的服务条款提供明确的使用权限。</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">除了新海诚风格，还支持哪些相似风格？</h3>
              <p>我们还支持<Link href="/styles/ghibli" className="text-primary hover:underline">吉卜力工作室</Link>和<Link href="/styles/miyazaki" className="text-primary hover:underline">宫崎骏</Link>等风格，您可以尝试不同风格创作多样化的作品。</p>
            </div>
          </div>
        </div>
        
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-semibold mb-6">开始创作您的新海诚风格图像</h2>
          <p className="mb-6 max-w-2xl mx-auto">无论您是动漫爱好者、内容创作者，还是设计师，IMG图图都能帮助您轻松创作出新海诚风格的精美图像。</p>
          <Link href="/sign-in">
            <Button size="lg" className="mx-auto">立即开始创作</Button>
          </Link>
        </div>
      </div>
    </div>
  );
} 