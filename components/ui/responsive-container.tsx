import React from "react";
import { cn } from "@/lib/utils";

interface ResponsiveContainerProps {
  children: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
  maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "4xl" | "6xl" | "full";
  padding?: "none" | "sm" | "md" | "lg";
}

/**
 * 响应式容器组件
 * 
 * 提供一致的响应式布局体验，可控制最大宽度、内边距和居中效果
 */
export function ResponsiveContainer({
  children,
  className,
  fullWidth = false,
  maxWidth = "xl",
  padding = "md",
}: ResponsiveContainerProps) {
  // 最大宽度映射
  const maxWidthClasses = {
    xs: "max-w-xs",
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "4xl": "max-w-4xl",
    "6xl": "max-w-6xl",
    full: "max-w-full"
  };
  
  // 内边距映射
  const paddingClasses = {
    none: "px-0",
    sm: "px-3 md:px-4",
    md: "px-4 md:px-6",
    lg: "px-5 md:px-8"
  };
  
  return (
    <div
      className={cn(
        "w-full mx-auto transition-all duration-300",
        !fullWidth && maxWidthClasses[maxWidth],
        paddingClasses[padding],
        className
      )}
    >
      {children}
    </div>
  );
}

interface ResponsiveSectionProps {
  children: React.ReactNode;
  className?: string;
  spacing?: "none" | "sm" | "md" | "lg";
}

/**
 * 响应式区域组件 - 用于创建具有一致间距的页面区域
 */
export function ResponsiveSection({
  children,
  className,
  spacing = "md",
}: ResponsiveSectionProps) {
  // 间距映射
  const spacingClasses = {
    none: "py-0",
    sm: "py-3 md:py-4",
    md: "py-5 md:py-6",
    lg: "py-6 md:py-8"
  };
  
  return (
    <section
      className={cn(
        "w-full transition-all duration-300",
        spacingClasses[spacing],
        className
      )}
    >
      {children}
    </section>
  );
}

interface ResponsiveGridProps {
  children: React.ReactNode;
  className?: string;
  columns?: number | { sm?: number; md?: number; lg?: number; xl?: number; };
  gap?: "none" | "sm" | "md" | "lg";
}

/**
 * 响应式卡片网格组件 - 用于创建自适应的卡片布局
 */
export function ResponsiveGrid({
  children,
  className,
  columns = { sm: 1, md: 2, lg: 3, xl: 4 },
  gap = "md",
}: ResponsiveGridProps) {
  // 列数映射
  let columnsClasses = "";
  
  if (typeof columns === "number") {
    columnsClasses = `grid-cols-1 md:grid-cols-${columns}`;
  } else {
    columnsClasses = cn(
      columns.sm && `grid-cols-${columns.sm}`,
      columns.md && `md:grid-cols-${columns.md}`,
      columns.lg && `lg:grid-cols-${columns.lg}`,
      columns.xl && `xl:grid-cols-${columns.xl}`
    );
  }
  
  // 间隙映射
  const gapClasses = {
    none: "gap-0",
    sm: "gap-3",
    md: "gap-4 md:gap-5",
    lg: "gap-5 md:gap-6"
  };
  
  return (
    <div
      className={cn(
        "grid w-full transition-all duration-300",
        columnsClasses,
        gapClasses[gap],
        className
      )}
    >
      {children}
    </div>
  );
} 