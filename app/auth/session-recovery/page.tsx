import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseClient } from '@/utils/supabase-client'

export default async function SessionRecovery() {
  const cookieStore = cookies()
  
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession()
    
    if (error) {
      console.error('Session recovery error:', error)
      redirect('/sign-in')
    }
    
    if (!session) {
      console.log('No session found during recovery, redirecting to sign in')
      redirect('/sign-in')
    }
    
    console.log('Session recovered successfully, redirecting to protected page')
    redirect('/protected')
  } catch (error) {
    console.error('Session recovery error:', error)
    redirect('/sign-in')
  }
  
  return null
} 