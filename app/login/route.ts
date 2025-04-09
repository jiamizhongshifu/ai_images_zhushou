import { NextResponse, NextRequest } from 'next/server';

// 从请求中获取当前域名
function getHostFromRequest(request: NextRequest) {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

export async function GET(request: NextRequest) {
  console.log('[路由] /login 请求被重定向到 /sign-in');
  
  // 从请求URL中提取查询参数
  const url = new URL(request.url);
  const params = url.searchParams.toString();
  
  // 构建重定向URL，保留查询参数
  const redirectPath = params ? `/sign-in?${params}` : '/sign-in';
  
  // 使用请求的主机名构建URL，确保在当前环境中重定向
  const redirectUrl = new URL(redirectPath, getHostFromRequest(request));
  
  return NextResponse.redirect(redirectUrl);
}

export async function POST(request: NextRequest) {
  console.log('[路由] POST /login 请求被重定向到 /sign-in');
  
  // 使用请求的主机名构建URL，确保在当前环境中重定向
  const redirectUrl = new URL('/sign-in', getHostFromRequest(request));
  
  return NextResponse.redirect(redirectUrl);
} 