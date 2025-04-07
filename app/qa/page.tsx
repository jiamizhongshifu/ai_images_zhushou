"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function QAPage() {
  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="max-w-7xl w-full px-4 py-8">
        {/* 页面标题 */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-3">常见问题</h1>
          <p className="text-lg text-muted-foreground text-center max-w-2xl">
            关于IMG图图平台的使用指南和常见问题解答
          </p>
        </div>

        {/* 问答内容 */}
        <div className="grid grid-cols-1 gap-6 mt-8">
          <Card>
            <CardHeader>
              <CardTitle>如何开始使用IMG图图？</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                首先需要注册账号并登录，然后点击导航栏的"创作"按钮，进入创作页面。
                您可以上传一张图片或直接输入文字描述，选择您喜欢的艺术风格，点击"生成"按钮开始创作。
                生成的图片会自动保存到您的历史记录中，可以在"历史"页面查看和管理。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>点数是什么？如何获取更多点数？</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                点数是您生成图片所需的虚拟货币，每生成一张图片消耗一点点数。
                新用户注册后会获得免费的初始点数。当点数不足时，您可以通过点击右上角用户区域的"充值"按钮购买更多点数。
                我们也会不定期举办活动，您可以通过参与活动获得免费点数。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>生成的图片可以用于商业用途吗？</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                IMG图图平台生成的图片您拥有个人使用权，可以用于个人创作和非商业用途。
                如需商业用途，请联系我们获取授权或查看我们的商业版服务。
                请注意，对于使用上传图片生成的作品，您需要确保您拥有原始图片的相关权利。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>如何获得更好的生成效果？</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                要获得更好的生成效果，您可以：
                <br />1. 提供更详细、具体的描述，包括风格、场景、颜色等细节。
                <br />2. 上传清晰、主题明确的参考图片。
                <br />3. 尝试不同的艺术风格，找到最适合您需求的风格。
                <br />4. 多次尝试，微调您的描述词，直到获得满意的结果。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>遇到问题如何获取帮助？</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                如果您在使用过程中遇到任何问题，可以通过以下方式获取帮助：
                <br />1. 查看本页面的常见问题解答。
                <br />2. 发送邮件至 121185809@qq.com 联系客服团队。
                <br />3. 在工作日 9:00-18:00 通过网站右下角的聊天窗口获取实时支持。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 