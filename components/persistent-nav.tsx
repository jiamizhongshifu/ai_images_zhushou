"use client"

import React, { useEffect, useState } from "react"
import { FloatingNav } from "@/components/ui/floating-navbar"
import { Home, User, HelpCircle } from "lucide-react"
import Link from "next/link"
import { hasEnvVars } from "@/utils/supabase/check-env-vars"
import { EnvVarWarning } from "@/components/env-var-warning"

export function PersistentNav() {
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  useEffect(() => {
    // 检查是否刚刚登出
    const loggedOutFlag = sessionStorage.getItem('isLoggedOut');
    if (loggedOutFlag === 'true') {
      setIsLoggedOut(true);
      // 使用后清除标记
      sessionStorage.removeItem('isLoggedOut');
    }
  }, []);

  const navItems = [
    {
      name: "首页",
      link: isLoggedOut ? "/?force_logout=true" : "/",
      icon: <Home className="h-4 w-4" />,
    },
    {
      name: "关于",
      link: "/about",
      icon: <User className="h-4 w-4" />,
    },
    {
      name: "支持",
      link: "/support",
      icon: <HelpCircle className="h-4 w-4" />,
    },
    {
      name: "登录",
      link: "/sign-in",
      icon: <User className="h-4 w-4" />,
    },
  ]

  return (
    <div className="relative w-full">
      <FloatingNav navItems={navItems} persistent={true} />
    </div>
  )
} 