import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export const createClient = async () => {
  const cookieStore = await cookies();

  // 从环境变量中读取URL和ANON KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 验证环境变量存在
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("缺少必要的Supabase环境变量");
    throw new Error("缺少必要的Supabase环境变量");
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options?: CookieOptions) {
          // 添加明确的cookie选项以增强cookie稳定性
          const finalOptions = {
            ...options,
            // 确保cookie在整个域名下可用
            path: options?.path || "/",
            // 增加cookie持久性，默认为7天
            maxAge: options?.maxAge || 60 * 60 * 24 * 7,
            // 确保安全设置
            secure: process.env.NODE_ENV === "production",
            // 确保cookie可用于跨请求
            httpOnly: true,
            sameSite: "lax" as const
          };
          
          cookieStore.set(name, value, finalOptions);
        },
        remove(name: string, options?: CookieOptions) {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        }
      },
    },
  );
};
