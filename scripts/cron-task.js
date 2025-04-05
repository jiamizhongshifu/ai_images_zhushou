/**
 * 本地开发环境定时任务脚本 - 无依赖版本
 * 用于定期检查悬挂的支付订单并尝试修复
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// 尝试手动加载.env.local文件
let taskKey = 'development-key';
let serverUrl = 'http://localhost:3000';

try {
  const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const envLines = envFile.split('\n');
  
  envLines.forEach(line => {
    if (line.startsWith('TASK_PROCESS_SECRET_KEY=')) {
      taskKey = line.split('=')[1].trim();
    }
    if (line.startsWith('NEXT_PUBLIC_SITE_URL=')) {
      serverUrl = line.split('=')[1].trim();
    }
  });
  
  console.log('已加载 .env.local 文件');
} catch (error) {
  console.log('未找到或无法读取 .env.local 文件，使用默认配置');
}

// 执行定时任务
function executeTask() {
  const timestamp = new Date().toLocaleString();
  console.log(`[${timestamp}] 检查悬挂订单...`);
  
  // 构建API URL
  const apiUrl = `${serverUrl}/api/cron/fix-pending-orders?key=${taskKey}`;
  
  exec(`curl -s "${apiUrl}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`执行错误: ${error.message}`);
      return;
    }
    
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    
    try {
      // 解析JSON响应
      const response = JSON.parse(stdout);
      
      if (response.success) {
        if (response.processed) {
          console.log(`✅ 成功处理 ${response.processed} 个悬挂订单`);
          
          // 显示每个订单的处理结果
          if (response.results && response.results.length > 0) {
            console.log('订单处理详情:');
            response.results.forEach((result, index) => {
              if (result.success) {
                console.log(`  ${index + 1}. 订单 ${result.order_no}: 成功`);
              } else {
                console.log(`  ${index + 1}. 订单 ${result.order_no}: 失败 - ${result.error || '未知错误'}`);
                // 如果有result对象，打印更多细节
                if (result.result) {
                  console.log(`     详情: ${JSON.stringify(result.result)}`);
                }
              }
            });
          }
        } else {
          console.log(`✓ ${response.message || '没有需要处理的订单'}`);
        }
      } else {
        console.error(`❌ 任务执行失败: ${response.error || '未知错误'}`);
      }
    } catch (parseError) {
      console.error('解析响应失败:', parseError.message);
      console.log('原始响应:', stdout);
    }
    
    console.log('---------------------------------------');
  });
}

console.log('=======================================');
console.log('  支付系统 - 本地开发环境定时任务监控  ');
console.log('=======================================');
console.log(`服务器地址: ${serverUrl}`);
console.log(`密钥: ${taskKey.substring(0, 3)}${'*'.repeat(taskKey.length - 6)}${taskKey.substring(taskKey.length - 3)}`);
console.log(`启动时间: ${new Date().toLocaleString()}`);
console.log('定时任务: 每10分钟检查一次悬挂订单');
console.log('---------------------------------------');

// 立即执行一次
executeTask();

// 设置定时器，每10分钟执行一次
const TEN_MINUTES = 10 * 60 * 1000;
setInterval(executeTask, TEN_MINUTES);

// 添加退出处理
process.on('SIGINT', () => {
  console.log('\n停止定时任务监控...');
  process.exit(0);
});

console.log('定时任务已启动，按Ctrl+C退出');
console.log('---------------------------------------'); 