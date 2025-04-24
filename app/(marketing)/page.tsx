import { Hero } from "@/components/ui/hero-with-group-of-images-text-and-two-buttons";
import { TransformationExamples } from "@/components/ui/transformation-examples";
import { StyleShowcase } from "@/components/ui/style-showcase";
import { UserTestimonials } from "@/components/ui/user-testimonials";
import Script from "next/script";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const metadata = {
  title: "IMG图图 - 吉卜力风格AI图片生成 | 动物森友会、新海诚风格一键生成",
  description: "IMG图图(imgtutu)是领先的AI图像创作平台，专业生成吉卜力、动物森友会、新海诚风格图片。只需简单描述即可生成精美图像，一键导出高清素材。",
};

export default function Home() {
  return (
    <>
      <Hero />
      <TransformationExamples />
      <StyleShowcase />
      <UserTestimonials />
      
      {/* 结构化数据 */}
      <Script id="structured-data" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "IMG图图 (imgtutu)",
        "url": "https://www.imgtool.com",
        "description": "IMG图图是领先的AI图像创作平台，支持吉卜力、动物森友会、新海诚等多种风格图片生成。只需简单描述即可获得精美图像，一键导出高清素材。",
        "applicationCategory": "MultimediaApplication, ArtApplication, DesignApplication",
        "operatingSystem": "Web",
        "keywords": "imgtutu, img图图, 吉卜力, 动物森友会, 新海诚, 图片生成, AI图像",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "CNY"
        },
        "author": {
          "@type": "Organization",
          "name": "IMG图图团队"
        }
      })}} />
      
      {/* FAQ部分 - 优化视觉体验 */}
      <section className="w-full py-16 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold tracking-tighter mb-4">AI图像生成常见问题</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              探索AI图像生成的奥秘，从基础操作到高级技巧，解答您在使用IMG图图(imgtutu)过程中可能遇到的所有问题。
            </p>
          </div>
          
          <div className="max-w-3xl mx-auto bg-background rounded-xl shadow-sm border">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 transition-colors text-left">
                  <h3 className="font-medium text-lg">如何使用IMG图图(imgtutu)生成吉卜力风格的动漫图片？</h3>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-muted-foreground">
                  <p>只需登录账号，选择"吉卜力"风格预设，输入您的文字提示词，AI将为您生成符合吉卜力风格的高清精美图像。提示词中可以描述场景、人物、色调等元素，AI会智能理解并创作相应的作品。</p>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-2" className="border-t">
                <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 transition-colors text-left">
                  <h3 className="font-medium text-lg">IMG图图支持动物森友会和新海诚风格的AI图片生成与转换吗？</h3>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-muted-foreground">
                  <p>是的，IMG图图(imgtutu)不仅支持动物森友会和新海诚等多种游戏动画风格的图片生成，还提供照片到游戏风格的转换功能。只需上传一张真实照片，选择相应风格，即可将其转换为动物森友会或新海诚风格的精美艺术作品。</p>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-3" className="border-t">
                <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 transition-colors text-left">
                  <h3 className="font-medium text-lg">AI生成的图片分辨率和质量如何？可以用于设计和印刷吗？</h3>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-muted-foreground">
                  <p>IMG图图生成的图片拥有高达1024×1024像素的分辨率，细节丰富，质量优良。生成的图像可直接用于社交媒体、网站设计、海报制作、产品展示等多种商业用途，满足高质量设计和印刷需求。</p>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-4" className="border-t">
                <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 transition-colors text-left">
                  <h3 className="font-medium text-lg">如何编写有效的提示词来生成理想的AI艺术图像？</h3>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-muted-foreground">
                  <p>编写有效提示词的关键是具体且详细：描述清楚场景（如"日落时的海边城堡"）、指定风格（如"宫崎骏风格"、"水彩画"）、提及色调（如"暖色调"、"高对比度"）和构图（如"广角视图"）。避免模糊表述，越具体的提示词越能得到符合预期的图像结果。</p>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-5" className="border-t">
                <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 transition-colors text-left">
                  <h3 className="font-medium text-lg">IMG图图能生成什么类型的AI图像？支持哪些艺术风格？</h3>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-muted-foreground">
                  <p>IMG图图(imgtutu)支持多种类型的图像生成，包括人物肖像、风景插画、概念艺术、抽象图案等。支持的艺术风格非常丰富，除了吉卜力、宫崎骏、新海诚等动画风格外，还包括水彩、油画、素描、赛博朋克、未来主义、复古像素风等多种艺术风格，满足不同创作需求。</p>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-6" className="border-t">
                <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 transition-colors text-left">
                  <h3 className="font-medium text-lg">AI图像生成的速度如何？需要等待多长时间？</h3>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-muted-foreground">
                  <p>IMG图图的AI图像生成速度非常快，标准图像通常在10-30秒内完成。生成时间会根据图像复杂度、服务器负载和所选模型而略有差异。高级用户可使用加速生成选项，进一步缩短等待时间，获得更高效的创作体验。</p>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-7" className="border-t">
                <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 transition-colors text-left">
                  <h3 className="font-medium text-lg">AI生成的动物森友会风格图片有版权问题吗？可以用于商业项目吗？</h3>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-muted-foreground">
                  <p>IMG图图生成的图片归用户所有，可用于个人和商业项目。我们的服务基于开源模型，生成的是全新的AI创作内容，而非复制现有作品。不过，我们仍建议用户在商业使用时，避免生成与特定IP过于相似的内容，以规避潜在版权风险。</p>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-8" className="border-t">
                <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 transition-colors text-left">
                  <h3 className="font-medium text-lg">如何获得最佳的动物森友会风格AI图像效果？有什么提示词技巧？</h3>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-2 text-muted-foreground">
                  <p>获得最佳动物森友会风格图像的技巧：1）使用具体的游戏描述（如"动物森友会风格小镇"比简单的"游戏风格"更有效）；2）添加细节描述如"可爱的动物角色"、"四季岛屿"；3）参考特定场景如"动物森友会咖啡厅"或"春季樱花树下"；4）指定构图和视角；5）使用明亮色彩和可爱风格的修饰词。持续尝试和调整提示词是提高生成质量的关键。</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>
    </>
  );
}
