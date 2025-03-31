import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SupportPage() {
  return (
    <div className="container mx-auto py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">客户支持</h1>
          <p className="text-xl text-muted-foreground max-w-xl mx-auto">
            我们随时为您提供帮助，解决您在使用过程中遇到的任何问题
          </p>
        </div>

        <Tabs defaultValue="faq" className="w-full mb-12">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="faq">常见问题</TabsTrigger>
            <TabsTrigger value="contact">联系我们</TabsTrigger>
          </TabsList>
          <TabsContent value="faq" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>常见问题解答</CardTitle>
                <CardDescription>
                  以下是用户最常遇到的问题和解答
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger>如何开始创建我的第一张AI图像？</AccordionTrigger>
                    <AccordionContent>
                      <p className="leading-7 mb-2">
                        创建您的第一张AI图像非常简单：
                      </p>
                      <ol className="list-decimal pl-5 space-y-2">
                        <li>登录您的账户（新用户请先注册）</li>
                        <li>点击"创建新图像"按钮</li>
                        <li>在文本框中详细描述您想要的图像</li>
                        <li>选择合适的风格和格式</li>
                        <li>点击"生成"按钮等待AI创作完成</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>
                  
                  <AccordionItem value="item-2">
                    <AccordionTrigger>我可以使用哪些提示词来获得更好的效果？</AccordionTrigger>
                    <AccordionContent>
                      <p className="leading-7 mb-2">
                        有效的提示词应该包含以下元素：
                      </p>
                      <ul className="list-disc pl-5 space-y-2">
                        <li>具体的主题和场景描述</li>
                        <li>光线氛围（如：明亮、昏暗、日落等）</li>
                        <li>艺术风格（如：油画、水彩、照片写实等）</li>
                        <li>色彩偏好（如：鲜艳、柔和、冷色调等）</li>
                        <li>构图要求（如：特写、全景、俯视角等）</li>
                      </ul>
                      <p className="mt-2 text-sm text-muted-foreground">
                        例如："一只橙色的猫站在阳光明媚的窗台上，背景是绿色植物，照片风格，柔和的自然光线，浅景深"
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                  
                  <AccordionItem value="item-3">
                    <AccordionTrigger>我生成的图像有版权限制吗？</AccordionTrigger>
                    <AccordionContent>
                      <p className="leading-7">
                        您使用我们平台生成的图像归您所有，您可以将其用于个人和商业用途。
                        但请注意，如果您的提示词包含受版权保护的角色、品牌或艺术作品，
                        最终生成的图像可能会受到相关版权法律的限制。
                        建议避免明确要求生成受版权保护的内容，以规避潜在的法律风险。
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                  
                  <AccordionItem value="item-4">
                    <AccordionTrigger>每月有图像生成数量限制吗？</AccordionTrigger>
                    <AccordionContent>
                      <p className="leading-7">
                        是的，不同套餐有不同的月度生成限额：
                      </p>
                      <ul className="list-disc pl-5 space-y-1 mt-2">
                        <li>免费账户：每月20张图像</li>
                        <li>基础会员：每月200张图像</li>
                        <li>专业会员：每月1000张图像</li>
                        <li>企业会员：无限制</li>
                      </ul>
                      <p className="mt-2 text-sm text-muted-foreground">
                        您可以随时在账户设置中查看当月剩余配额。
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                  
                  <AccordionItem value="item-5">
                    <AccordionTrigger>如何提高生成图像的质量？</AccordionTrigger>
                    <AccordionContent>
                      <p className="leading-7 mb-2">
                        提高生成图像质量的几个关键因素：
                      </p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>使用详细的描述，包含更多细节</li>
                        <li>指定想要的艺术风格和质量水平</li>
                        <li>使用高级选项调整参数，如清晰度和细节程度</li>
                        <li>尝试不同的提示词变体，找到最佳表达方式</li>
                        <li>升级到高级会员，获取更高质量的模型访问权限</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="contact" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>联系我们</CardTitle>
                <CardDescription>
                  填写表单向我们提交您的问题，我们将尽快回复
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-sm font-medium">
                        您的姓名
                      </label>
                      <Input id="name" placeholder="请输入您的姓名" required />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium">
                        电子邮箱
                      </label>
                      <Input id="email" type="email" placeholder="your@email.com" required />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="subject" className="text-sm font-medium">
                      问题主题
                    </label>
                    <Input id="subject" placeholder="简要描述您的问题" required />
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="message" className="text-sm font-medium">
                      详细描述
                    </label>
                    <textarea
                      id="message"
                      className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="请详细描述您遇到的问题或需要的帮助..."
                      required
                    ></textarea>
                  </div>
                  
                  <Button type="submit" className="w-full">
                    提交问题
                  </Button>
                </form>
                
                <div className="mt-8 pt-8 border-t">
                  <h3 className="font-medium mb-4">其他联系方式</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-primary"
                      >
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <span>400-123-4567</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-primary"
                      >
                        <rect width="20" height="16" x="2" y="4" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                      <span>support@aiimagehelper.com</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 