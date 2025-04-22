import { createClient } from '@supabase/supabase-js'
import { type Database } from '@/types/supabase'

let client: ReturnType<typeof createClient<Database>> | null = null

export function getSupabaseClient() {
  if (client) return client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: 'sb-auth-token',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  })

  return client
}

// 重置客户端实例
export function resetSupabaseClient() {
  client = null
} 