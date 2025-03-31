"use client";
import React, { useState } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const FloatingNav = ({
  navItems,
  className,
  persistent = false,
}: {
  navItems: {
    name: string;
    link: string;
    icon?: React.ReactNode;
  }[];
  className?: string;
  persistent?: boolean;
}) => {
  const { scrollYProgress } = useScroll();
  const [visible, setVisible] = useState(persistent);
  const pathname = usePathname();

  useMotionValueEvent(scrollYProgress, "change", (current) => {
    // 如果设置为常驻显示，则不执行隐藏逻辑
    if (persistent) {
      setVisible(true);
      return;
    }
    
    // Check if current is not undefined and is a number
    if (typeof current === "number") {
      let direction = current! - scrollYProgress.getPrevious()!;

      if (scrollYProgress.get() < 0.05) {
        setVisible(false);
      } else {
        if (direction < 0) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    }
  });

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{
          opacity: persistent ? 1 : 0,
          y: persistent ? 0 : -100,
        }}
        animate={{
          y: visible ? 0 : -100,
          opacity: visible ? 1 : 0,
        }}
        transition={{
          duration: 0.3,
          ease: "easeInOut",
        }}
        className={cn(
          "flex max-w-fit fixed top-6 inset-x-0 mx-auto backdrop-blur-md bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-gray-800 rounded-full shadow-lg z-[5000] px-1 py-1.5 items-center justify-center",
          className
        )}
      >
        <div className="flex items-center space-x-1 px-2">
          {navItems.map((navItem: any, idx: number) => {
            const isActive = pathname === navItem.link;
            return (
              <Link
                key={`link-${idx}`}
                href={navItem.link}
                className={cn(
                  "relative px-3 py-2 rounded-full transition-all duration-200 ease-in-out flex items-center space-x-1",
                  isActive 
                    ? "text-white bg-primary dark:bg-primary" 
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                {navItem.icon && (
                  <span className={cn(
                    "flex-shrink-0",
                    isActive ? "text-white" : ""
                  )}>
                    {navItem.icon}
                  </span>
                )}
                <span className={cn(
                  "text-sm font-medium",
                  isActive ? "text-white" : "",
                  {"ml-1": navItem.icon}
                )}>
                  {navItem.name}
                </span>
              </Link>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
