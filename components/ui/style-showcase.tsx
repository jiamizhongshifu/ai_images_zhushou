import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "./button";
import { ArrowRight } from "lucide-react";

export function StyleShowcase() {
  const styleTopics = [
    {
      id: "ghibli",
      title: "吉卜力风格",
      description: "体验吉卜力工作室的独特画风，创作充满童话感的精美场景。",
      image: "/images/feat_05.jpeg",
      href: "/styles/ghibli",
    },
    {
      id: "animalcrossing",
      title: "动物森友会风格",
      description: "探索动物森友会的可爱世界，创作温馨治愈的岛屿场景和圆润可爱的角色。",
      image: "/examples/senyouhui.jpg",
      href: "/styles/animalcrossing",
    },
    {
      id: "shinkai",
      title: "新海诚风格",
      description: "捕捉新海诚作品中令人惊叹的光影效果和唯美氛围。",
      image: "/examples/shinkai.jpg",
      href: "/styles/shinkai",
    },
  ];

  return (
    <div className="w-full py-16">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold tracking-tighter mb-4">精选风格专题</h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            探索我们精心打造的风格专题，轻松创作出不同风格的精美图像。
            从吉卜力的童话世界，到动物森友会的治愈画风，再到新海诚的唯美光影。
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {styleTopics.map((topic) => (
            <div key={topic.id} className="flex flex-col bg-card rounded-xl overflow-hidden shadow-md transition-all duration-300 hover:shadow-lg hover:translate-y-[-4px]">
              <div className="relative h-48 w-full">
                <Image 
                  src={topic.image} 
                  alt={topic.title}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-6 flex flex-col flex-grow">
                <h3 className="text-xl font-semibold mb-2">{topic.title}</h3>
                <p className="text-muted-foreground mb-4 flex-grow">{topic.description}</p>
                <Link href={topic.href} className="self-start">
                  <Button variant="outline" className="flex items-center gap-2">
                    了解更多 <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 