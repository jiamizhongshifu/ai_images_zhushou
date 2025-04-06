import DeployButton from "@/components/deploy-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import Link from "next/link";
import "./globals.css";
import { validateRequiredEnvVars } from '@/utils/env';
import { Navbar } from "@/components/layout/navbar";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "IMG图图 - AI图像创意平台",
  description: "将您的照片转化为魔幻风格的艺术作品，AI智能图像创作平台",
};

const geistSans = Geist({
  display: "swap",
  subsets: ["latin"],
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
    <html lang="zh-CN" className={geistSans.className} suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* 全局导航栏 */}
          <Navbar />
          
          <main className="min-h-screen flex flex-col items-center">
            <div className="flex-1 w-full flex flex-col gap-20 items-center">
              <div className="flex flex-col gap-20 max-w-5xl p-5 mt-8">
                {children}
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
        </ThemeProvider>
      </body>
    </html>
  );
}
