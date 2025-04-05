/**
 * 订单修复工具 - 手动修复特定订单
 * 使用方法: node scripts/fix-order.js <订单号>
 */

const { exec } = require('child_process');

// 获取命令行参数
const orderNo = process.argv[2];

if (!orderNo) {
  console.error('错误: 缺少订单号参数');
  console.log('正确用法: node scripts/fix-order.js <订单号>');
  process.exit(1);
}

console.log(`开始修复订单: ${orderNo}`);

// 设置API URL
const apiUrl = `http://localhost:3000/api/payment/fix-public?order_no=${orderNo}`;

// 执行API调用
exec(`curl -s "${apiUrl}"`, (error, stdout, stderr) => {
  if (error) {
    console.error(`执行错误: ${error.message}`);
    process.exit(1);
  }
  
  if (stderr) {
    console.error(`stderr: ${stderr}`);
    process.exit(1);
  }
  
  try {
    // 解析JSON响应
    const response = JSON.parse(stdout);
    
    if (response.success) {
      console.log('✅ 订单修复成功!');
      
      if (response.result) {
        console.log('处理结果:');
        console.log(JSON.stringify(response.result, null, 2));
        
        if (response.result.oldCredits !== undefined && 
            response.result.newCredits !== undefined) {
          console.log(`点数变更: ${response.result.oldCredits} → ${response.result.newCredits} (+${response.result.addCredits})`);
        }
      }
    } else {
      console.error(`❌ 订单修复失败: ${response.error || '未知错误'}`);
    }
  } catch (parseError) {
    console.error('解析响应失败:', parseError.message);
    console.log('原始响应:', stdout);
  }
}); 