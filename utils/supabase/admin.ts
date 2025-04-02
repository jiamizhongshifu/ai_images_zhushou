import { createClient } from "@supabase/supabase-js";

// 创建具有管理员权限的Supabase客户端
export const createAdminClient = () => {
  // 从环境变量中读取URL和SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 验证环境变量存在
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("缺少必要的Supabase环境变量");
    throw new Error("缺少必要的Supabase环境变量");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}; 