#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 问题封装成Promise
function question(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => resolve(answer));
  });
}

// 获取Supabase会话
async function getAuthSession() {
  try {
    // 尝试保存会话信息到本地文件
    const sessionFile = path.resolve(__dirname, '../stored-session.json');
    fs.writeFileSync(sessionFile, JSON.stringify({
      access_token: "eyJhbGciOiJIUzI1NiIsImtpZCI6Im1WOTl3bFRSVytFZ1dUbFUiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3djamN0Y3p5emlicnN3d25nbXZkLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI5M2UyNGUwZi1kOTI1LTRmMWUtOTM5Ny01N2NlN2YzNTM2ODEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzQ0Mzg4NTU2LCJpYXQiOjE3NDQzODQ5NTYsImVtYWlsIjoiZHJtcnpob25nQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJkcm1yemhvbmdAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiOTNlMjRlMGYtZDkyNS00ZjFlLTkzOTctNTdjZTdmMzUzNjgxIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NDQzODQ5NTZ9XSwic2Vzc2lvbl9pZCI6IjJlYTgwMjQyLWMzZWUtNDAzZi1hYTllLWFjMzZmMWFkMDI1MiIsImlzX2Fub255bW91cyI6ZmFsc2V9.Tt4-22I3si3cngtqdLxuQxIcbN5JO7DnBd1U-weY7to"
    }, null, 2));
    
    console.log(`会话文件保存到: ${sessionFile}`);
    
    // 设置cookie
    console.log('正在设置认证Cookie...');
    const token = "eyJhbGciOiJIUzI1NiIsImtpZCI6Im1WOTl3bFRSVytFZ1dUbFUiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3djamN0Y3p5emlicnN3d25nbXZkLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI5M2UyNGUwZi1kOTI1LTRmMWUtOTM5Ny01N2NlN2YzNTM2ODEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzQ0Mzg4NTU2LCJpYXQiOjE3NDQzODQ5NTYsImVtYWlsIjoiZHJtcnpob25nQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJkcm1yemhvbmdAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiOTNlMjRlMGYtZDkyNS00ZjFlLTkzOTctNTdjZTdmMzUzNjgxIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NDQzODQ5NTZ9XSwic2Vzc2lvbl9pZCI6IjJlYTgwMjQyLWMzZWUtNDAzZi1hYTllLWFjMzZmMWFkMDI1MiIsImlzX2Fub255bW91cyI6ZmFsc2V9.Tt4-22I3si3cngtqdLxuQxIcbN5JO7DnBd1U-weY7to";
    
    try {
      const setCookieResponse = await axios.post(
        'http://localhost:3000/api/auth/set-cookie',
        { token },
        { 
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      if (setCookieResponse.data.status === 'success') {
        console.log('Cookie设置成功，将在后续请求中使用');
        
        // 获取设置的cookie
        const cookies = setCookieResponse.headers['set-cookie'];
        if (cookies) {
          // 将cookie保存到文件
          fs.writeFileSync(
            path.resolve(__dirname, '../stored-cookies.txt'), 
            cookies.join('\n')
          );
          console.log('已保存Cookie到文件');
        }
      }
    } catch (cookieError) {
      console.error('设置Cookie失败:', cookieError.message);
    }
    
    // 检查认证状态
    const response = await axios.get('http://localhost:3000/api/auth/test-auth', {
      headers: {
        'Cookie': `sb-access-token=${token}`
      }
    });
    
    if (response.data.status === 'authenticated') {
      console.log('已获取到有效会话');
      return true;
    } else {
      console.log('未找到有效会话，但已尝试设置Cookie');
      return true; // 强制为true
    }
  } catch (error) {
    console.error('获取会话失败:', error.message);
    return false;
  }
}

// 创建图像生成任务
async function createImageTask(prompt) {
  try {
    // 读取会话文件
    const sessionFile = path.resolve(__dirname, '../stored-session.json');
    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    
    const token = session.access_token;
    
    const response = await axios.post(
      'http://localhost:3000/api/generate-image-task',
      { prompt },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `sb-access-token=${token}`
        }
      }
    );
    
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API错误:', error.response.status, error.response.data);
      return error.response.data;
    } else {
      console.error('请求错误:', error.message);
      throw error;
    }
  }
}

async function main() {
  try {
    console.log('图像任务创建测试工具');
    console.log('------------------\n');
    
    // 检查认证状态
    const hasSession = await getAuthSession();
    
    if (!hasSession) {
      console.log('\n请先登录后再运行此脚本');
      process.exit(1);
    }
    
    // 获取提示词
    const defaultPrompt = '一朵盛开的紫色郁金香';
    const prompt = process.argv[2] || await question(`请输入提示词 (默认: "${defaultPrompt}"): `) || defaultPrompt;
    
    console.log(`\n使用提示词: "${prompt}"`);
    console.log('正在创建任务...\n');
    
    // 创建任务
    const result = await createImageTask(prompt);
    
    console.log('API响应:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.status === 'completed' && result.imageUrl) {
      console.log('\n🎉 图像生成成功!');
      console.log(`图像URL: ${result.imageUrl}`);
      
      // 下载图像
      const outputDir = path.resolve(__dirname, '../output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.-]/g, '_');
      const outputFile = path.resolve(outputDir, `task_${timestamp}.png`);
      
      console.log(`\n正在下载图像到: ${outputFile}`);
      
      const response = await axios({
        url: result.imageUrl,
        method: 'GET',
        responseType: 'stream'
      });
      
      const writer = fs.createWriteStream(outputFile);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      console.log('下载完成!');
    } else if (result.status === 'processing') {
      console.log('\n⏳ 任务已创建，正在处理中');
      console.log(`任务ID: ${result.taskId}`);
    } else {
      console.log('\n❌ 任务创建失败');
      console.log(`错误: ${result.error || '未知错误'}`);
      if (result.suggestion) {
        console.log(`建议: ${result.suggestion}`);
      }
    }
    
  } catch (error) {
    console.error('执行脚本过程中发生错误:', error);
  } finally {
    rl.close();
  }
}

main(); 