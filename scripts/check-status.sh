#!/bin/bash
echo "=== 任务系统状态检查 ==="
date

# 检查监控器cron是否设置
if crontab -l 2>/dev/null | grep -F "/Users/zhongqingbiao/Downloads/ai_images_zhushou/scripts/monitor-tasks.mjs" > /dev/null; then
  echo "监控任务: 已设置 ✓"
else
  echo "监控任务: 未设置 ✗"
fi

# 检查任务处理器是否运行
if ps aux | grep task-processor.mjs | grep -v grep > /dev/null; then
  PIDS=$(ps aux | grep task-processor.mjs | grep -v grep | awk '{print $2}')
  echo "任务处理器: 运行中 ✓ (PID: $PIDS)"
else
  echo "任务处理器: 未运行 ✗"
fi

# 检查卡住的任务
echo "检查卡住的任务..."
cd "/Users/zhongqingbiao/Downloads/ai_images_zhushou" || exit
node -e "
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

async function checkStuckTasks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const thresholdTime = new Date();
  thresholdTime.setMinutes(thresholdTime.getMinutes() - 20);
  
  const { data, error } = await supabase
    .from('ai_images_creator_tasks')
    .select('task_id, status, created_at')
    .eq('status', 'processing')
    .lt('created_at', thresholdTime.toISOString());
  
  if (error) {
    console.error('查询失败:', error);
    return;
  }
  
  if (data && data.length > 0) {
    console.log(`发现 ${data.length} 个卡住的任务:`);
    data.forEach(task => {
      console.log(`  - 任务ID: ${task.task_id}, 创建时间: ${task.created_at}`);
    });
  } else {
    console.log('没有发现卡住的任务');
  }
}

checkStuckTasks()
  .catch(err => console.error('检查失败:', err));
"
