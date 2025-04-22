import { createClient, SupabaseClient, Session, AuthChangeEvent } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

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
    console.log('[Supabase Client] 存储访问受限，使用内存存储')
    return new MemoryStorage()
  }
}

let client: SupabaseClient<Database> | null = null
let storage: Storage | null = null

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  // 确保只创建一次存储实例
  if (!storage) {
    storage = createStorage()
  }

  client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: 'sb-auth-token',
      storage,
      detectSessionInUrl: true,
      flowType: 'pkce',
      autoRefreshToken: true,
      debug: process.env.NODE_ENV === 'development'
    },
    global: {
      headers: {
        'x-client-info': 'supabase-js-singleton'
      }
    }
  })

  // 添加认证状态变化监听
  client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
    console.log('[Supabase Client] Auth State Change:', event, session?.user?.id)
  })

  return client
}

// 重置客户端实例
export function resetSupabaseClient() {
  client = null
  storage = null
} 