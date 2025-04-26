import { updateTaskProgress } from '../utils/updateTaskProgress';
import { createClient } from '@supabase/supabase-js';

async function testProgressUpdate() {
  console.log('开始测试任务进度更新功能...');
  
  const testTaskId = `test-${Date.now()}`;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  try {
    // 1. 创建测试任务
    console.log('创建测试任务...');
    const { data: task, error: createError } = await supabase
      .from('image_tasks')
      .insert({
        task_id: testTaskId,
        status: 'processing',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (createError) throw createError;
    console.log('测试任务创建成功:', task);
    
    // 2. 测试正常进度更新
    console.log('\n测试正常进度更新...');
    const normalUpdate = await updateTaskProgress(
      testTaskId,
      50,
      'processing',
      process.env.NEXT_PUBLIC_APP_URL
    );
    console.log('正常进度更新结果:', normalUpdate ? '成功' : '失败');
    
    // 3. 测试并发更新
    console.log('\n测试并发更新...');
    const concurrentUpdates = await Promise.all([
      updateTaskProgress(testTaskId, 60, 'processing'),
      updateTaskProgress(testTaskId, 70, 'processing'),
      updateTaskProgress(testTaskId, 80, 'processing')
    ]);
    console.log('并发更新结果:', concurrentUpdates.map(r => r ? '成功' : '失败'));
    
    // 4. 测试错误重试
    console.log('\n测试错误重试...');
    const badUpdate = await updateTaskProgress(
      'non-existent-task',
      90,
      'processing'
    );
    console.log('错误重试结果:', badUpdate ? '成功' : '失败（预期）');
    
    // 5. 验证最终状态
    console.log('\n验证最终任务状态...');
    const { data: finalTask, error: readError } = await supabase
      .from('image_tasks')
      .select('*')
      .eq('task_id', testTaskId)
      .single();
      
    if (readError) throw readError;
    console.log('最终任务状态:', finalTask);
    
    // 6. 清理测试数据
    console.log('\n清理测试数据...');
    const { error: deleteError } = await supabase
      .from('image_tasks')
      .delete()
      .eq('task_id', testTaskId);
      
    if (deleteError) throw deleteError;
    console.log('测试数据清理完成');
    
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

// 运行测试
testProgressUpdate().catch(console.error); 