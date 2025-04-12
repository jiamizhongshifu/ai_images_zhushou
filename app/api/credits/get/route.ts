import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// 创建内存缓存
const CACHE = new Map<string, {credits: number, timestamp: number}>();
const CACHE_TTL = 60000; // 1分钟缓存

// 请求计数器
const REQUEST_COUNTERS = new Map<string, {count: number, resetTime: number}>();
const MAX_REQUESTS = 5; // 每60秒最多5次请求
const RATE_LIMIT_WINDOW = 60000; // 60秒

/**
 * 简单的请求限制功能
 * @param userId 用户ID
 * @returns 是否超过限制
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const counter = REQUEST_COUNTERS.get(userId);
  
  // 如果没有计数记录或已过重置时间，创建新记录
  if (!counter || now > counter.resetTime) {
    REQUEST_COUNTERS.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return false;
  }
  
  // 增加计数并检查是否超过限制
  counter.count += 1;
  return counter.count > MAX_REQUESTS;
}

/**
 * 获取用户当前点数的API接口
 * 注意: 这个接口使用普通客户端，通过客户端的认证获取当前用户
 * 
 * 请求参数:
 * - force: 是否强制刷新 (0/1)
 * 
 * 返回:
 * - success: 是否成功
 * - credits: 用户点数
 * - error: 错误信息(如果有)
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Credits API] 处理获取用户点数请求');
    
    // 检查是否需要强制刷新
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('force') === '1';
    console.log(`[Credits API] 强制刷新: ${forceRefresh}`);
    
    // 创建Supabase客户端
    const supabase = await createClient();
    
    // 获取当前认证用户
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.log('[Credits API] 用户未认证');
      return NextResponse.json({ 
        success: false, 
        error: "用户未认证" 
      }, { status: 401 });
    }
    
    const userId = user.id;
    console.log(`[Credits API] 用户已认证: ${userId}`);
    
    // 如果不是强制刷新，先检查请求频率限制
    if (!forceRefresh) {
      // 检查缓存，如果有缓存且未过期，直接返回
      const cachedData = CACHE.get(userId);
      const now = Date.now();
      
      if (cachedData && (now - cachedData.timestamp < CACHE_TTL)) {
        console.log(`[Credits API] 返回缓存的点数: ${cachedData.credits} (缓存时间: ${new Date(cachedData.timestamp).toISOString()})`);
        return NextResponse.json(
          { success: true, credits: cachedData.credits },
          { 
            status: 200,
            headers: { 
              'Cache-Control': 'max-age=60, s-maxage=60',
              'X-Credits-Cache': 'HIT',
              'X-Credits-Cache-Time': `${Math.round((now - cachedData.timestamp)/1000)}s ago`
            }
          }
        );
      }
      
      // 检查请求频率限制
      if (checkRateLimit(userId)) {
        console.log(`[Credits API] 用户 ${userId} 请求过于频繁，返回缓存或默认值`);
        // 如果有过期的缓存，仍然返回它而不是拒绝请求
        if (cachedData) {
          return NextResponse.json(
            { success: true, credits: cachedData.credits },
            { 
              status: 200,
              headers: { 
                'Cache-Control': 'max-age=60, s-maxage=60',
                'X-Credits-Cache': 'STALE',
                'X-Credits-Rate-Limited': 'true'
              }
            }
          );
        }
        
        // 真的没有缓存且超过频率限制，返回429错误
        return NextResponse.json(
          { success: false, error: "请求过于频繁，请稍后再试" },
          { status: 429 }
        );
      }
    }
    
    // 创建管理员客户端，以便获取最准确的数据
    const adminClient = forceRefresh ? await createAdminClient() : supabase;
    
    // 查询用户点数
    const { data: creditsData, error: creditsError } = await adminClient
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', userId)
      .maybeSingle();
    
    // 如果找不到记录或发生错误，尝试创建一个新记录
    if (!creditsData || creditsError) {
      console.log(`[Credits API] 用户 ${userId} 点数记录不存在或查询错误，尝试创建新记录`);
      
      // 使用管理员客户端创建记录
      const adminClient = await createAdminClient();
      const { data: newCredits, error: insertError } = await adminClient
        .from('ai_images_creator_credits')
        .insert({
          user_id: userId,
          credits: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('credits')
        .single();
      
      if (insertError) {
        console.error(`[Credits API] 创建用户 ${userId} 点数记录失败:`, insertError);
        // 即使创建失败，也返回默认点数，确保前端可以显示
        return NextResponse.json(
          { success: true, credits: 5 },
          { 
            status: 200,
            headers: { 
              'Cache-Control': 'max-age=60, s-maxage=60',
              'X-Credits-Default': 'true'
            }
          }
        );
      }
      
      const credits = newCredits?.credits || 5;
      
      // 更新缓存
      CACHE.set(userId, {
        credits: credits,
        timestamp: Date.now()
      });
      
      console.log(`[Credits API] 成功创建用户 ${userId} 点数记录: ${credits}`);
      return NextResponse.json(
        { success: true, credits: credits },
        { 
          status: 200,
          headers: { 
            'Cache-Control': 'max-age=60, s-maxage=60',
            'X-Credits-New-Record': 'true'
          }
        }
      );
    }
    
    // 更新缓存
    CACHE.set(userId, {
      credits: creditsData.credits,
      timestamp: Date.now()
    });
    
    console.log(`[Credits API] 成功获取用户 ${userId} 点数: ${creditsData.credits}${forceRefresh ? ' (强制刷新)' : ''}`);
    return NextResponse.json(
      { success: true, credits: creditsData.credits },
      { 
        status: 200,
        headers: { 
          'Cache-Control': 'max-age=60, s-maxage=60',
          'X-Credits-Cache': 'MISS',
          'X-Credits-Forced': forceRefresh ? 'true' : 'false'
        }
      }
    );
    
  } catch (error: any) {
    console.error("[Credits API] 处理获取用户点数请求时出错:", error);
    return NextResponse.json(
      { success: false, error: error.message || "服务器内部错误" },
      { status: 500 }
    );
  }
} 