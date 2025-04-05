/**
 * 本地开发环境定时任务脚本
 * 用于定期检查悬挂的支付订单并尝试修复
 */

const cron = require('node-cron');
const { exec } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// 尝试加载.env.local文件
try {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
    console.log('已加载 .env.local 文件');
  } else {
    dotenv.config();
    console.log('未找到 .env.local 文件，使用默认环境变量');
  }
} catch (error) {
  console.warn('加载环境变量失败:', error.message);
}

// 设置任务密钥（从环境变量获取或使用默认值）
const TASK_KEY = process.env.TASK_PROCESS_SECRET_KEY || 'development-key';
const SERVER_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

console.log('=======================================');
console.log('  支付系统 - 本地开发环境定时任务监控  ');
console.log('=======================================');
console.log(`服务器地址: ${SERVER_URL}`);
console.log(`启动时间: ${new Date().toLocaleString()}`);
console.log('定时任务: 每10分钟检查一次悬挂订单');
console.log('---------------------------------------');

// 立即执行一次，验证配置是否正确
executeTask();

// 每10分钟执行一次 "*/10 * * * *"
cron.schedule('*/10 * * * *', () => {
  executeTask();
});

// 执行定时任务
function executeTask() {
  const timestamp = new Date().toLocaleString();
  console.log(`[${timestamp}] 检查悬挂订单...`);
  
  // 构建API URL
  const apiUrl = `${SERVER_URL}/api/cron/fix-pending-orders?key=${TASK_KEY}`;
  
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
              console.log(`  ${index + 1}. 订单 ${result.order_no}: ${result.success ? '成功' : '失败'}`);
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

// 添加退出处理
process.on('SIGINT', () => {
  console.log('\n停止定时任务监控...');
  process.exit(0);
});

// 防止脚本退出
process.stdin.resume();

console.log('定时任务已启动，按Ctrl+C退出');
console.log('---------------------------------------'); 