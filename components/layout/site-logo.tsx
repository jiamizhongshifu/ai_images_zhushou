"use client";

import React from "react";
import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteLogoProps {
  className?: string;
}

export function SiteLogo({ className }: SiteLogoProps) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10">
        <ImageIcon className="h-5 w-5 text-primary" />
      </div>
      <span className="font-bold text-lg tracking-tight">IMG图图</span>
    </Link>
  );
} 