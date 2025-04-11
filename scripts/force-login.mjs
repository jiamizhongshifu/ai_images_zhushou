#!/usr/bin/env node

import fetch from 'node-fetch';
import readline from 'readline';

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

async function main() {
  try {
    console.log('强制登录测试工具');
    console.log('----------------');
    
    // 获取服务器地址
    const serverUrl = process.argv[2] || await question('请输入服务器地址 (默认: http://localhost:3000): ') || 'http://localhost:3000';
    
    // 获取用户邮箱
    const email = process.argv[3] || await question('请输入用户邮箱: ');
    
    if (!email) {
      console.error('错误: 必须提供用户邮箱');
      process.exit(1);
    }
    
    console.log(`\n正在为用户 ${email} 创建登录会话...`);
    
    // 调用强制登录API
    const response = await fetch(`${serverUrl}/api/auth/force-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`强制登录失败: ${data.error || response.statusText}`);
      if (data.details) {
        console.error(`详细信息: ${data.details}`);
      }
      process.exit(1);
    }
    
    // 打印会话信息
    console.log('\n登录成功!');
    console.log(`用户ID: ${data.userId}`);
    console.log(`访问令牌: ${data.session.access_token.substring(0, 10)}...`);
    console.log(`过期时间: ${new Date(data.session.expires_at * 1000).toLocaleString()}`);
    
    console.log('\n会话信息已获取，您可以使用以下方式在浏览器中设置会话:');
    console.log('\n在浏览器控制台中运行:');
    console.log('----------------------');
    console.log(`
// 设置Supabase会话
const session = ${JSON.stringify(data.session, null, 2)};
localStorage.setItem('sb-${serverUrl.includes('localhost') ? 'localhost' : new URL(serverUrl).hostname}-auth-token', JSON.stringify(session));
console.log('会话已设置，请刷新页面');
    `);
    
  } catch (error) {
    console.error('执行脚本过程中发生错误:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main(); 