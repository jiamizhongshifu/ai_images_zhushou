import { cn } from "@/lib/utils";
import React from "react";

const sizeClasses = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-10 w-10",
};

type SpinnerProps = {
  size?: keyof typeof sizeClasses;
  className?: string;
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-current border-t-transparent text-primary",
        sizeClasses[size],
        className
      )}
    />
  );
} 