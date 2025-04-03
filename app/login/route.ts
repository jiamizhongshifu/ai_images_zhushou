import { NextResponse } from 'next/server';

export async function GET() {
  console.log('[路由] /login 请求被重定向到 /sign-in');
  return NextResponse.redirect(new URL('/sign-in', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'));
}

export async function POST() {
  console.log('[路由] POST /login 请求被重定向到 /sign-in');
  return NextResponse.redirect(new URL('/sign-in', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'));
} 