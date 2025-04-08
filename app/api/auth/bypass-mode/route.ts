import { NextRequest, NextResponse } from 'next/server';

/**
 * 绕过认证模式的API接口
 * 用于特殊情况下临时访问API
 */
export async function GET(request: NextRequest) {
  // 禁用此功能
  return NextResponse.json({
    success: false,
    message: "此功能未启用"
  }, { status: 403 });
}

export async function POST(request: NextRequest) {
  // 禁用此功能
  return NextResponse.json({
    success: false,
    message: "此功能未启用"
  }, { status: 403 });
} 