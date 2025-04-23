"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ChangelogBadge() {
  const router = useRouter();
  const [hasNewChanges, setHasNewChanges] = useState(false);
  
  useEffect(() => {
    // 检查用户是否已查看最新更新
    const lastViewedVersion = localStorage.getItem("last_viewed_changelog") || "";
    const currentVersion = "v1.1.0"; // 当前最新版本
    
    if (lastViewedVersion !== currentVersion) {
      setHasNewChanges(true);
    }
  }, []);
  
  const handleClick = () => {
    // 更新查看记录
    localStorage.setItem("last_viewed_changelog", "v1.1.0"); // 当前最新版本
    setHasNewChanges(false);
    router.push("/changelog");
  };
  
  if (!hasNewChanges) return null;
  
  return (
    <Badge 
      variant="outline" 
      className="ml-1 cursor-pointer animate-pulse bg-primary/10"
      onClick={handleClick}
    >
      <Bell className="h-3 w-3 mr-1" />
      新更新
    </Badge>
  );
} 