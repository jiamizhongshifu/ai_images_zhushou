"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface SiteLogoProps {
  className?: string;
}

export function SiteLogo({ className }: SiteLogoProps) {
  return (
    <Link 
      href="/" 
      className={cn("flex items-center gap-2", className)}
      title="IMG图图 - AI智能图像创作平台"
      aria-label="IMG图图网站首页"
    >
      <div className="flex items-center justify-center h-9 w-9 overflow-hidden">
        <Image 
          src="/images/logo/bunny-logo.png" 
          alt="IMG图图 - AI智能图像创作平台" 
          width={36} 
          height={36} 
          className="object-contain"
          priority
        />
      </div>
      <span className="font-bold text-lg tracking-tight">IMG图图</span>
    </Link>
  );
} 