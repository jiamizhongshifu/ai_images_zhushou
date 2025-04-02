import { createBrowserClient } from "@supabase/ssr";

export const createClient = () => {
  // 从环境变量中读取URL和ANON KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 验证环境变量存在
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("缺少必要的Supabase环境变量");
    throw new Error("缺少必要的Supabase环境变量");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
};
