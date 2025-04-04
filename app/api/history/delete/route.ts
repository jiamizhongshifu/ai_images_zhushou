import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(request: Request) {
  try {
    // 获取请求体
    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少必要的图片URL参数' 
      }, { status: 400 });
    }

    // 使用标准客户端获取用户信息
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('获取用户信息失败:', authError);
      return NextResponse.json({ 
        success: false, 
        error: '未授权的操作' 
      }, { status: 401 });
    }

    console.log(`准备强制删除图片: ${imageUrl}`);
    
    // 提取文件名与其他关键部分
    const fileName = imageUrl.split('/').pop() || '';
    const hostname = imageUrl.split('/')[2] || '';
    console.log(`提取的文件名: ${fileName}, 域名: ${hostname}`);
    
    // 使用管理员客户端执行删除操作，绕过RLS和事务问题
    const adminClient = await createAdminClient();
    
    // 开始标记删除操作并记录时间戳
    const deleteStartTime = new Date().toISOString();
    console.log(`[${deleteStartTime}] 开始执行强制删除操作`);
    
    // 先查询该图片的所有匹配记录
    const { data: matchingRecords, error: queryError } = await adminClient
      .from('ai_images_creator_history')
      .select('id, image_url')
      .eq('user_id', user.id)
      .or(`image_url.eq.${imageUrl},image_url.ilike.%${fileName}%`);
    
    if (queryError) {
      console.error('查询匹配记录失败:', queryError);
      return NextResponse.json({ 
        success: false, 
        error: '查询图片记录失败' 
      }, { status: 500 });
    }
    
    console.log(`找到${matchingRecords?.length || 0}条匹配记录`);
    
    if (!matchingRecords || matchingRecords.length === 0) {
      console.log('未找到匹配记录，尝试直接执行删除');
      
      // 尝试直接使用强力条件删除
      const { error: deleteError, count } = await adminClient
        .from('ai_images_creator_history')
        .delete()
        .eq('user_id', user.id)
        .or(`image_url.eq.${imageUrl},image_url.ilike.%${fileName}%`);
      
      if (deleteError) {
        console.error('强制删除失败:', deleteError);
        return NextResponse.json({ 
          success: false, 
          error: '强制删除记录失败' 
        }, { status: 500 });
      }
      
      console.log(`强制删除成功，删除了${count || 0}条记录`);
      
      // 再次查询确认删除结果
      const { data: afterRecords, error: countError } = await adminClient
        .from('ai_images_creator_history')
        .select('count', { count: 'exact' });
      
      const recordCount = afterRecords ? afterRecords.length : 'unknown';
      const afterDeleteTime = new Date().toISOString();
      console.log(`[${afterDeleteTime}] 强制删除后剩余记录数: ${recordCount}`);
      
      return NextResponse.json({ 
        success: true, 
        message: `强制删除操作完成，删除了${count || 0}条记录`,
        startTime: deleteStartTime,
        endTime: afterDeleteTime
      });
    }
    
    console.log('发现匹配记录，将执行ID精确删除:');
    matchingRecords.forEach(record => {
      console.log(`- ID: ${record.id}, URL: ${record.image_url}`);
    });
    
    // 收集所有删除操作
    let totalDeleted = 0;
    const deleteResults = [];
    
    // 逐个执行删除操作，使用硬删除模式
    for (const record of matchingRecords) {
      console.log(`正在强制删除记录ID: ${record.id}`);
      
      // 使用多重条件确保删除正确的记录
      const { error: deleteError } = await adminClient
        .from('ai_images_creator_history')
        .delete()
        .eq('id', record.id)
        .eq('user_id', user.id);
      
      if (deleteError) {
        console.error(`删除记录ID ${record.id} 失败:`, deleteError);
        deleteResults.push({
          id: record.id,
          success: false,
          error: deleteError.message
        });
      } else {
        totalDeleted++;
        deleteResults.push({
          id: record.id,
          success: true
        });
        console.log(`成功删除记录ID: ${record.id}`);
      }
      
      // 添加延时以确保事务完成
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 再次查询确认删除结果
    const { data: finalRecords, error: finalCountError } = await adminClient
      .from('ai_images_creator_history')
      .select('count', { count: 'exact' });
    
    const finalCount = finalRecords ? finalRecords.length : 'unknown';
    const afterDeleteTime = new Date().toISOString();
    console.log(`[${afterDeleteTime}] 删除操作完成，剩余记录数: ${finalCount}`);
    console.log(`成功删除${totalDeleted}/${matchingRecords.length}条记录`);
    
    return NextResponse.json({ 
      success: true, 
      message: `删除操作完成，成功删除了${totalDeleted}条记录`,
      deleteResults,
      deleteCount: totalDeleted,
      startTime: deleteStartTime,
      endTime: afterDeleteTime
    });
  } catch (error) {
    console.error('处理删除请求时出错:', error);
    return NextResponse.json({ 
      success: false, 
      error: '服务器内部错误' 
    }, { status: 500 });
  }
} 