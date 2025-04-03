import { createClient } from '@supabase/supabase-js';

/**
 * 创建具有管理员权限的Supabase客户端
 * 注意：这个客户端拥有完全的数据库读写权限，应该只在服务器端使用
 * 并且应该小心使用，确保不会暴露给客户端
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('环境变量缺失: NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    throw new Error('无法创建管理员客户端：缺少必要的环境变量');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * 检查数据库中是否存在指定的用户ID
 */
export async function userExists(userId: string): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error(`检查用户 ${userId} 是否存在时出错:`, error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    console.error(`检查用户是否存在时出现异常:`, error);
    return false;
  }
}

/**
 * 获取用户的角色和权限
 */
export async function getUserRole(userId: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      console.error(`获取用户 ${userId} 角色时出错:`, error);
      return null;
    }
    
    return data?.role || null;
  } catch (error) {
    console.error(`获取用户角色时出现异常:`, error);
    return null;
  }
}

/**
 * 检查用户是否为管理员
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'admin';
} 