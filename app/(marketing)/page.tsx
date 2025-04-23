import { Hero } from "@/components/ui/hero-with-group-of-images-text-and-two-buttons";
import { TransformationExamples } from "@/components/ui/transformation-examples";
import { UserTestimonials } from "@/components/ui/user-testimonials";
import Script from "next/script";

export const metadata = {
  title: "IMG图图 - AI智能图像创作平台 | 一键生成高质量AI艺术作品",
  description: "IMG图图是领先的AI图像创作平台，只需简单描述即可生成精美图像。支持多种风格，一键导出高清素材，满足您的创意需求。",
};

export default function Home() {
  return (
    <>
      <Hero />
      <TransformationExamples />
      <UserTestimonials />
      
      {/* 结构化数据 */}
      <Script id="structured-data" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "IMG图图",
        "url": "https://www.imgtool.com",
        "description": "IMG图图是领先的AI图像创作平台，只需简单描述即可生成精美图像。支持多种风格，一键导出高清素材，满足您的创意需求。",
        "applicationCategory": "MultimediaApplication",
        "operatingSystem": "Web",
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
    </>
  );
}
