import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseClient } from '@/utils/supabase-client'

export default async function SessionBridge() {
  const cookieStore = cookies()
  
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession()
    
    if (error) {
      console.error('Session bridge error:', error)
      redirect('/sign-in')
    }
    
    if (!session) {
      console.log('No session found, redirecting to sign in')
      redirect('/sign-in')
    }
    
    console.log('Valid session found, redirecting to protected page')
    redirect('/protected')
  } catch (error) {
    console.error('Session bridge error:', error)
    redirect('/sign-in')
  }
  
  return null
} 