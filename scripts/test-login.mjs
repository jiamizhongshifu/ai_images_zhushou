#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
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

// 登录函数
async function login(email, password) {
  try {
    const response = await axios.post(
      'http://localhost:3000/api/auth/sign-in',
      { email, password },
      {
        headers: {
          'Content-Type': 'application/json'
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

// 检查认证状态
async function checkAuth() {
  try {
    const response = await axios.get('http://localhost:3000/api/auth/test-auth');
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
    console.log('登录测试工具');
    console.log('------------\n');
    
    // 先检查当前认证状态
    console.log('检查当前认证状态...');
    const authStatus = await checkAuth();
    
    if (authStatus.status === 'authenticated') {
      console.log('✅ 已登录:');
      console.log(`用户: ${authStatus.user.email} (${authStatus.user.id})`);
      console.log(`点数: ${authStatus.credits}`);
      console.log(`会话到期: ${new Date(authStatus.session.expiresAt * 1000).toLocaleString()}`);
      
      const shouldLogout = await question('\n是否登出重新登录? (y/n): ');
      if (shouldLogout.toLowerCase() !== 'y') {
        console.log('\n保持当前登录状态，退出测试');
        process.exit(0);
      }
      
      console.log('\n请继续输入登录信息进行重新登录');
    } else {
      console.log('❌ 未登录或会话已过期');
    }
    
    // 获取登录信息
    const email = await question('\n请输入邮箱: ');
    if (!email) {
      console.error('错误: 邮箱不能为空');
      process.exit(1);
    }
    
    const password = await question('请输入密码: ');
    if (!password) {
      console.error('错误: 密码不能为空');
      process.exit(1);
    }
    
    console.log('\n正在登录...');
    
    // 登录
    const loginResult = await login(email, password);
    
    console.log('\nAPI响应:');
    console.log(JSON.stringify(loginResult, null, 2));
    
    if (loginResult.status === 'success') {
      console.log('\n✅ 登录成功!');
      
      // 获取会话信息
      const session = loginResult.session;
      console.log(`用户ID: ${session.user.id}`);
      console.log(`邮箱: ${session.user.email}`);
      console.log(`访问令牌: ${session.access_token.substring(0, 10)}...`);
      console.log(`过期时间: ${new Date(session.expires_at * 1000).toLocaleString()}`);
      
      console.log('\n在浏览器控制台中设置会话:');
      console.log(`
// 设置Supabase会话
const session = ${JSON.stringify(session, null, 2)};
localStorage.setItem('sb-${new URL('http://localhost:3000').hostname}-auth-token', JSON.stringify(session));
console.log('会话已设置，请刷新页面');
      `);
    } else if (loginResult.status === 'partial_success') {
      console.log('\n⚠️ 部分成功');
      console.log(loginResult.message);
      
      if (loginResult.magicLink) {
        console.log(`\n魔法链接: ${loginResult.magicLink}`);
        console.log('请点击上面的链接完成登录');
      }
    } else {
      console.log('\n❌ 登录失败');
      console.log(`错误: ${loginResult.error}`);
      
      if (loginResult.details) {
        console.log(`详细信息: ${loginResult.details}`);
      }
    }
    
  } catch (error) {
    console.error('执行脚本过程中发生错误:', error);
  } finally {
    rl.close();
  }
}

main(); 