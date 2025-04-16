/**
 * 测试任务进度更新功能
 * 此脚本用于验证环境变量配置和API连接是否正常
 */

const dotenv = require('dotenv');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

// 加载环境变量
function loadEnv() {
  try {
    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      dotenv.config({ path: envLocalPath });
      console.log('已加载 .env.local 文件');
    } else {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log('已加载 .env 文件');
      } else {
        console.warn('未找到 .env 文件，请确保环境变量已正确设置');
      }
    }
  } catch (error) {
    console.error('加载环境变量失败:', error);
  }
}

loadEnv();

// 验证环境变量
function validateEnv() {
  const requiredVars = [
    'TASK_PROCESS_SECRET_KEY',
    'NEXT_PUBLIC_APP_URL'
  ];
  
  let missingVars = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }
  
  if (missingVars.length > 0) {
    console.error(`错误: 缺少以下必要的环境变量: ${missingVars.join(', ')}`);
    return false;
  }
  
  console.log('环境变量验证通过');
  console.log(`TASK_PROCESS_SECRET_KEY: ${process.env.TASK_PROCESS_SECRET_KEY.substring(0, 6)}...`);
  console.log(`NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}`);
  
  return true;
}

// 测试进度更新API
async function testProgressUpdate() {
  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const apiKey = process.env.TASK_PROCESS_SECRET_KEY;
    const url = `${apiBaseUrl}/api/update-task-progress`;
    const testTaskId = `test-${Date.now()}`;
    
    console.log(`测试API连接: ${url}`);
    console.log(`使用测试任务ID: ${testTaskId}`);
    
    // 准备请求头
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    
    // 发送测试请求
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        taskId: testTaskId,
        progress: 50,
        stage: 'testing'
      }),
      timeout: 15000 // 15秒超时
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('API连接测试成功!');
      console.log('响应数据:', data);
      
      // 检查列是否存在
      if (data.columnsExist) {
        console.log(`数据库列状态: progress列${data.columnsExist.progress ? '存在' : '不存在'}, stage列${data.columnsExist.stage ? '存在' : '不存在'}`);
        
        if (!data.columnsExist.progress || !data.columnsExist.stage) {
          console.warn('警告: 数据库中缺少一些必要的列，请运行迁移脚本添加');
        }
      }
      
      return true;
    } else {
      const errorText = await response.text();
      console.error(`API连接测试失败: HTTP ${response.status}`);
      console.error('错误详情:', errorText);
      
      return false;
    }
  } catch (error) {
    console.error('API连接测试异常:', error.message);
    
    // 提供更详细的错误诊断
    if (error.code === 'ECONNREFUSED') {
      console.error(`连接被拒绝，请确保应用正在运行并且NEXT_PUBLIC_APP_URL (${process.env.NEXT_PUBLIC_APP_URL}) 配置正确`);
    } else if (error.code === 'ENOTFOUND') {
      console.error(`无法解析主机名，请检查NEXT_PUBLIC_APP_URL (${process.env.NEXT_PUBLIC_APP_URL}) 配置是否正确`);
    } else if (error.type === 'request-timeout') {
      console.error('请求超时，请检查网络连接和应用响应时间');
    }
    
    return false;
  }
}

// 运行测试
async function runTest() {
  console.log('开始测试任务进度更新功能...');
  
  // 验证环境变量
  if (!validateEnv()) {
    process.exit(1);
  }
  
  // 测试API连接
  const apiTestResult = await testProgressUpdate();
  
  if (apiTestResult) {
    console.log('✅ 测试完成: 任务进度更新功能正常工作!');
    process.exit(0);
  } else {
    console.error('❌ 测试失败: 任务进度更新功能不正常，请检查上述错误消息并修复问题');
    process.exit(1);
  }
}

// 执行测试
runTest(); 