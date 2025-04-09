import { createClient } from "@supabase/supabase-js";

// 创建具有完全数据库访问权限的管理员客户端
export function createAdminClient() {
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

// 增加一个创建事务支持的管理员客户端函数
export async function createTransactionalAdminClient() {
  const client = createAdminClient();
  
  // 为客户端添加executeTransaction方法，用于执行事务
  const executeTransaction = async <T>(callback: (client: any) => Promise<T>): Promise<T> => {
    try {
      // 开始事务
      await client.rpc('begin_transaction');
      
      // 执行事务回调
      const result = await callback(client);
      
      // 提交事务
      await client.rpc('commit_transaction');
      
      return result;
    } catch (error) {
      // 回滚事务
      try {
        await client.rpc('rollback_transaction');
      } catch (rollbackError) {
        console.error('回滚事务失败:', rollbackError);
      }
      
      throw error;
    }
  };
  
  return {
    ...client,
    executeTransaction
  };
} 