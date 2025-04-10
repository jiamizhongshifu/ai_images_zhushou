import DeployButton from "@/components/deploy-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import { Quicksand, Nunito } from "next/font/google";
import { ThemeProvider } from "next-themes";
import Link from "next/link";
import "./globals.css";
import { validateRequiredEnvVars } from '@/utils/env';
import { Navbar } from "@/components/layout/navbar";
import { ToastProvider, ToastViewport } from "@/components/ui/enhanced-toast";
import { Toaster } from "@/components/ui/toaster";
import LogoutHandler from "@/components/layout/logout-handler";
import { Suspense } from 'react';
import { UserStateProvider } from '@/app/components/providers/user-state-provider';

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "IMG图图 - AI图像创意平台",
  description: "将您的照片转化为魔幻风格的艺术作品，AI智能图像创作平台",
};

// 替换Geist字体为Ghiblit.ai风格的字体组合
const quicksand = Quicksand({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-quicksand",
});

const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-nunito",
});

// 验证必要的环境变量
// 这段代码只在服务器端执行
try {
  validateRequiredEnvVars();
  console.log('✅ 环境变量验证通过');
} catch (error) {
  console.error('❌ 环境变量验证失败:', error);
  // 生产环境只记录警告，开发环境会抛出错误导致应用无法启动
  if (process.env.NODE_ENV === 'development') {
    throw error;
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html 
      lang="zh-CN" 
      className={`${quicksand.variable} ${nunito.variable}`} 
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground font-nunito">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ToastProvider>
            {/* 用户状态提供器 - 统一管理用户认证和积分状态 */}
            <UserStateProvider>
              {/* 登出状态处理器 - 不可见组件，用于处理登出状态 */}
              <Suspense fallback={null}>
                <LogoutHandler />
              </Suspense>
              
              {/* 全局导航栏 */}
              <Navbar />
              
              <main className="min-h-screen flex flex-col items-center">
                <div className="flex-1 w-full flex flex-col gap-20 items-center">
                  <div className="flex flex-col gap-20 w-full p-5 mt-8">
                    {/* 使用Suspense包装主内容，优化加载体验 */}
                    <Suspense fallback={
                      <div className="flex justify-center items-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                      </div>
                    }>
                      {children}
                    </Suspense>
                  </div>

                  <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
                    <p>
                      Powered by{" "}
                      <a
                        href="https://supabase.com/?utm_source=create-next-app&utm_medium=template&utm_term=nextjs"
                        target="_blank"
                        className="font-bold hover:underline"
                        rel="noreferrer"
                      >
                        Supabase
                      </a>
                    </p>
                    <ThemeSwitcher />
                  </footer>
                </div>
              </main>
              
              {/* 添加Toast视窗 */}
              <ToastViewport />
              <Toaster />
            </UserStateProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
