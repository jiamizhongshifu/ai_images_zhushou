import { Hero } from "@/components/ui/hero-with-group-of-images-text-and-two-buttons";
import { TransformationExamples } from "@/components/ui/transformation-examples";
import { UserTestimonials } from "@/components/ui/user-testimonials";

export default function Home() {
  return (
    <>
      <Hero />
      <TransformationExamples />
      <UserTestimonials />
    </>
  );
}
