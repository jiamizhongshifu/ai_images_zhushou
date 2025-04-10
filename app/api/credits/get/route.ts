import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取用户当前点数的API接口
 * 注意: 这个接口使用普通客户端，通过客户端的认证获取当前用户
 * 
 * 返回:
 * - success: 是否成功
 * - credits: 用户点数
 * - error: 错误信息(如果有)
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Credits API] 处理获取用户点数请求');
    
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
    
    console.log(`[Credits API] 用户已认证: ${user.id}`);
    
    // 查询用户点数
    const { data: creditsData, error: creditsError } = await supabase
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', user.id)
      .maybeSingle();
    
    // 如果找不到记录或发生错误，尝试创建一个新记录
    if (!creditsData || creditsError) {
      console.log(`[Credits API] 用户 ${user.id} 点数记录不存在或查询错误，尝试创建新记录`);
      
      // 使用管理员客户端创建记录
      const adminClient = await createAdminClient();
      const { data: newCredits, error: insertError } = await adminClient
        .from('ai_images_creator_credits')
        .insert({
          user_id: user.id,
          credits: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('credits')
        .single();
      
      if (insertError) {
        console.error(`[Credits API] 创建用户 ${user.id} 点数记录失败:`, insertError);
        // 即使创建失败，也返回默认点数，确保前端可以显示
        return NextResponse.json(
          { success: true, credits: 5 },
          { 
            status: 200,
            headers: { 
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          }
        );
      }
      
      console.log(`[Credits API] 成功创建用户 ${user.id} 点数记录: ${newCredits?.credits || 5}`);
      return NextResponse.json(
        { success: true, credits: newCredits?.credits || 5 },
        { 
          status: 200,
          headers: { 
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      );
    }
    
    console.log(`[Credits API] 成功获取用户 ${user.id} 点数: ${creditsData.credits}`);
    return NextResponse.json(
      { success: true, credits: creditsData.credits },
      { 
        status: 200,
        headers: { 
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
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