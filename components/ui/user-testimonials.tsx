"use client";

import { Star, Quote } from "lucide-react";
import Image from "next/image";

// 定义用户评价数据结构
interface Testimonial {
  id: number;
  name: string;
  role: string;
  avatar: string;
  content: string;
  rating: number;
}

export function UserTestimonials() {
  // 用户评价数据
  const testimonials: Testimonial[] = [
    {
      id: 1,
      name: "李明",
      role: "摄影爱好者",
      avatar: "/images/team-1.jpg",
      content: "这个AI工具让我的照片焕发新生！只要简单描述我想要的风格，几秒钟内就能将普通照片转换成令人惊叹的艺术作品。强烈推荐给所有创意工作者！",
      rating: 5,
    },
    {
      id: 2,
      name: "张晓华",
      role: "自媒体博主",
      avatar: "/images/team-2.jpg",
      content: "作为内容创作者，我一直在寻找能提升我作品视觉效果的工具。这个平台的转换效果超出了我的预期，帮助我的内容获得了更多关注和互动。",
      rating: 5,
    },
    {
      id: 3,
      name: "王芳",
      role: "平面设计师",
      avatar: "/images/team-3.jpg",
      content: "专业级别的图像风格转换工具，为我的设计项目节省了大量时间。各种风格的转换效果都非常精美，客户非常满意最终呈现的效果。",
      rating: 4,
    },
  ];

  return (
    <section className="w-full py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-bold tracking-tighter mb-4">用户怎么说</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            听听我们的用户如何利用AI图像转换工具创造令人惊叹的艺术作品，提升他们的创意项目
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial) => (
            <div 
              key={testimonial.id} 
              className="bg-card rounded-xl p-8 shadow-sm border border-border hover:shadow-md transition-all relative overflow-hidden group"
            >
              <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Quote size={40} className="text-primary" />
              </div>
              
              <div className="flex items-center mb-6">
                <div className="relative h-14 w-14 rounded-full overflow-hidden mr-4 border-2 border-primary/10">
                  <Image
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{testimonial.name}</h3>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>

              <div className="flex mb-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < testimonial.rating ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                    }`}
                  />
                ))}
              </div>

              <blockquote className="text-muted-foreground italic">
                "{testimonial.content}"
              </blockquote>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
} 