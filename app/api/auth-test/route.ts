import { NextResponse } from 'next/server';
import { withApiAuth } from '../auth-middleware';

export async function GET(req: Request) {
  return withApiAuth(req, async (user, supabase) => {
    // 这里是受保护的API逻辑
    return NextResponse.json({
      success: true,
      message: '身份验证成功',
      user: {
        id: user.id,
        email: user.email
      },
      timestamp: new Date().toISOString()
    });
  });
} 