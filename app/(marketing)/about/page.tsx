import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { AvatarFallback } from "@/components/ui/avatar";
import { AvatarImage } from "@/components/ui/avatar";

export default function AboutPage() {
  return (
    <div className="container mx-auto py-12 px-4">
      <div className="flex flex-col gap-8 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <Badge className="mb-4">关于我们</Badge>
          <h1 className="text-4xl font-bold tracking-tight mb-4">AI图像创作助手</h1>
          <p className="text-xl text-muted-foreground">
            让每个人都能轻松创作出精美图像
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>我们的使命</CardTitle>
            <CardDescription>
              让AI图像生成技术惠及每一个人
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="leading-7">
              我们致力于打造最直观、最易用的AI图像生成工具，让每个人都能通过简单的文字描述创造出专业级别的图像作品。
              无论您是设计师、市场营销人员、内容创作者还是普通用户，
              我们的平台都能帮助您轻松将创意转化为视觉作品。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>核心技术</CardTitle>
            <CardDescription>
              先进的AI模型与用户友好的界面
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="leading-7 mb-4">
              我们的平台基于最先进的AI生成模型，能够理解复杂的文本提示并生成高质量图像。
              通过持续优化和学习，我们的系统不断提升生成质量和速度，为用户提供更好的体验。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="flex flex-col items-center text-center p-4">
                <div className="bg-primary/10 p-3 rounded-full mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary"
                  >
                    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                    <path d="M18 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
                  </svg>
                </div>
                <h3 className="font-medium">高效处理</h3>
                <p className="text-sm text-muted-foreground">毫秒级响应，秒级出图</p>
              </div>
              <div className="flex flex-col items-center text-center p-4">
                <div className="bg-primary/10 p-3 rounded-full mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <h3 className="font-medium">高质量输出</h3>
                <p className="text-sm text-muted-foreground">商业级图像质量</p>
              </div>
              <div className="flex flex-col items-center text-center p-4">
                <div className="bg-primary/10 p-3 rounded-full mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary"
                  >
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <h3 className="font-medium">多样化风格</h3>
                <p className="text-sm text-muted-foreground">支持各类艺术风格</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>我们的团队</CardTitle>
            <CardDescription>
              由AI专家与设计师组成的创新团队
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap justify-center gap-8 py-4">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-24 w-24 mb-4">
                  <AvatarImage src="/images/team-1.jpg" alt="张明" />
                  <AvatarFallback>张明</AvatarFallback>
                </Avatar>
                <h3 className="font-medium">张明</h3>
                <p className="text-sm text-muted-foreground">创始人 & AI研究员</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-24 w-24 mb-4">
                  <AvatarImage src="/images/team-2.jpg" alt="李华" />
                  <AvatarFallback>李华</AvatarFallback>
                </Avatar>
                <h3 className="font-medium">李华</h3>
                <p className="text-sm text-muted-foreground">UI/UX设计师</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-24 w-24 mb-4">
                  <AvatarImage src="/images/team-3.jpg" alt="王强" />
                  <AvatarFallback>王强</AvatarFallback>
                </Avatar>
                <h3 className="font-medium">王强</h3>
                <p className="text-sm text-muted-foreground">全栈开发工程师</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 