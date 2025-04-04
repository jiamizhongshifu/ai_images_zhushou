import { createClient } from "@supabase/supabase-js";

// 创建具有完全数据库访问权限的管理员客户端
export async function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('缺少必要的Supabase配置环境变量');
  }
  
  // 使用service_role密钥创建客户端，绕过RLS策略
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  });
} 