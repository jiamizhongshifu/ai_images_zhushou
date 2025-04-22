import { createClient } from '@supabase/supabase-js'
import { type Database } from '@/types/supabase'

// 创建内存存储
class MemoryStorage implements Storage {
  private data: { [key: string]: string } = {}

  getItem(key: string): string | null {
    return this.data[key] || null
  }

  setItem(key: string, value: string): void {
    this.data[key] = value
  }

  removeItem(key: string): void {
    delete this.data[key]
  }

  clear(): void {
    this.data = {}
  }

  get length(): number {
    return Object.keys(this.data).length
  }

  key(index: number): string | null {
    return Object.keys(this.data)[index] || null
  }
}

// 创建存储工厂
function createStorage(): Storage {
  if (typeof window === 'undefined') {
    return new MemoryStorage()
  }

  try {
    // 测试 localStorage 是否可用
    localStorage.setItem('test', 'test')
    localStorage.removeItem('test')
    return localStorage
  } catch (e) {
    try {
      // 测试 sessionStorage 是否可用
      sessionStorage.setItem('test', 'test')
      sessionStorage.removeItem('test')
      return sessionStorage
    } catch (e) {
      console.log('[Supabase Client] 所有持久化存储都不可用，使用内存存储')
      return new MemoryStorage()
    }
  }
}

let client: ReturnType<typeof createClient<Database>> | null = null

export function getSupabaseClient() {
  if (client) return client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  // 获取可用的存储
  const storage = createStorage()

  client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: 'sb-auth-token',
      storage,
      detectSessionInUrl: true,
      flowType: 'pkce',
      autoRefreshToken: true,
      debug: process.env.NODE_ENV === 'development'
    }
  })

  return client
}

// 重置客户端实例
export function resetSupabaseClient() {
  client = null
} 