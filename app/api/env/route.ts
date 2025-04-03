import { NextResponse } from 'next/server';

export async function GET() {
  // 只返回NEXT_PUBLIC_开头的环境变量
  const publicEnvVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || '',
    NEXT_PUBLIC_SUPABASE_DEBUG: process.env.NEXT_PUBLIC_SUPABASE_DEBUG || ''
  };

  return NextResponse.json(publicEnvVars);
} 