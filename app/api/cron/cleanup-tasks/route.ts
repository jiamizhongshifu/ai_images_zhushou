import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

// 设置任务超时时间
const TASK_TIMEOUT_HOURS = 12; // 12小时超时
// 设置历史记录清理时间（保留30天的历史记录）
const HISTORY_CLEANUP_DAYS = 30;

export async function GET(request: Request) {
  try {
    // 检查Secret Key
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const cronSecret = process.env.CRON_SECRET || 'development-key';
    
    // 在生产环境中验证Secret Key
    if (process.env.NODE_ENV === 'production' && key !== cronSecret) {
      console.error('Cron任务密钥无效');
      return NextResponse.json(
        { error: '访问被拒绝' },
        { status: 403 }
      );
    }
    
    // 获取Supabase Admin客户端
    const supabase = createAdminClient();
    
    // 1. 清理超时任务 - 计算超时时间戳
    const timeoutDate = new Date();
    timeoutDate.setHours(timeoutDate.getHours() - TASK_TIMEOUT_HOURS);
    const timeoutTimestamp = timeoutDate.toISOString();
    
    // 获取所有超时任务
    const { data: timeoutTasks, error: timeoutError } = await supabase
      .from('image_tasks')
      .select('id')
      .in('status', ['pending', 'processing'])
      .lt('created_at', timeoutTimestamp)
      .limit(100);
    
    if (timeoutError) {
      console.error(`获取超时任务失败: ${timeoutError.message}`);
      return NextResponse.json(
        { error: '获取超时任务失败', details: timeoutError.message },
        { status: 500 }
      );
    }
    
    let cleanedTasksCount = 0;
    
    if (timeoutTasks && timeoutTasks.length > 0) {
      console.log(`标记 ${timeoutTasks.length} 个超时任务为失败`);
      
      // 更新超时任务状态
      const { error: updateError } = await supabase
        .from('image_tasks')
        .update({
          status: 'failed',
          error_message: `任务超时(${TASK_TIMEOUT_HOURS}小时)`,
          updated_at: new Date().toISOString()
        })
        .in('id', timeoutTasks.map(task => task.id));
      
      if (updateError) {
        console.error(`更新超时任务失败: ${updateError.message}`);
      } else {
        cleanedTasksCount = timeoutTasks.length;
      }
    } else {
      console.log('没有超时任务需要清理');
    }
    
    // 2. 清理历史记录中过期的失败任务 - 计算清理日期
    const cleanupDate = new Date();
    cleanupDate.setDate(cleanupDate.getDate() - HISTORY_CLEANUP_DAYS);
    const cleanupTimestamp = cleanupDate.toISOString();
    
    // 清理旧的失败任务记录
    const { data: cleanupResult, error: cleanupError } = await supabase
      .from('image_tasks')
      .delete()
      .lt('created_at', cleanupTimestamp)
      .eq('status', 'failed')
      .select('count');
    
    let cleanedHistoryCount = 0;
    
    if (cleanupError) {
      console.error(`清理旧的失败任务记录失败: ${cleanupError.message}`);
    } else if (cleanupResult) {
      cleanedHistoryCount = cleanupResult.length;
      console.log(`已清理 ${cleanedHistoryCount} 条旧的失败任务记录`);
    }
    
    // 3. 可选：清理太旧的历史记录（如果需要）
    // 保留 30 天内的历史记录，更早的可以被清理
    // 注意：这部分是可选的，取决于您的数据保留策略
    
    // 例如，从ai_images_creator_history表中删除30天前的记录
    /*
    const { error: historyClearError } = await supabase
      .from('ai_images_creator_history')
      .delete()
      .lt('created_at', cleanupTimestamp);
    
    if (historyClearError) {
      console.error(`清理旧的历史记录失败: ${historyClearError.message}`);
    } else {
      console.log(`已清理30天前的历史记录`);
    }
    */
    
    // 返回处理结果
    return NextResponse.json({
      message: '清理完成',
      cleanedTasks: cleanedTasksCount,
      cleanedHistoryRecords: cleanedHistoryCount
    });
    
  } catch (error) {
    console.error(`Cron清理任务执行失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: 'Cron清理任务执行失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 