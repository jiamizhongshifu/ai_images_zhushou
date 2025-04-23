"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { changelogData } from "@/data/changelog";

export function ChangelogBadge() {
  const router = useRouter();
  const pathname = usePathname();
  const [hasNewChanges, setHasNewChanges] = useState(false);
  
  // 获取最新版本号
  const getLatestVersion = () => {
    const publishedVersions = changelogData
      .filter(entry => entry.isPublished && entry.version !== "即将推出")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return publishedVersions[0]?.version || "";
  };

  useEffect(() => {
    const currentVersion = getLatestVersion();
    const lastViewedVersion = localStorage.getItem("last_viewed_changelog") || "";
    
    // 如果当前在更新日志页面，自动更新已查看状态
    if (pathname === "/changelog" && currentVersion) {
      localStorage.setItem("last_viewed_changelog", currentVersion);
      setHasNewChanges(false);
    } 
    // 否则检查是否有新更新
    else if (lastViewedVersion !== currentVersion && currentVersion) {
      setHasNewChanges(true);
    }
  }, [pathname]);
  
  const handleClick = () => {
    const currentVersion = getLatestVersion();
    if (currentVersion) {
      localStorage.setItem("last_viewed_changelog", currentVersion);
    }
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