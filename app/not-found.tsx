'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-3xl mx-auto py-16 px-4">
      <h1 className="text-6xl font-bold mb-6">404</h1>
      <h2 className="text-3xl font-medium mb-4">页面未找到</h2>
      <p className="text-muted-foreground mb-8">
        抱歉，您访问的页面不存在。您可以返回IMG图图首页继续探索AI图像创作的无限可能。
      </p>
      <Link href="/">
        <Button variant="default" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          返回IMG图图首页
        </Button>
      </Link>
    </div>
  );
} 