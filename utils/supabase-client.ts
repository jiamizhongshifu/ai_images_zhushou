import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 创建全局单例
export const supabaseClient = createClient<Database>(supabaseUrl, supabaseKey);

// 导出类型
export type SupabaseClient = typeof supabaseClient; 