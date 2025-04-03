#!/usr/bin/env node

/**
 * 代理设置和依赖安装脚本
 * 该脚本会:
 * 1. 检测当前代理设置
 * 2. 安装必要的依赖（undici及其依赖项）
 * 3. 测试代理连接
 * 4. 修改相关脚本以支持代理
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 配置
const HTTP_PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || null;
const DEFAULT_PROXY = 'http://127.0.0.1:7890';
const DEPENDENCIES = [
  { name: 'undici', version: '5.28.2' },
  { name: '@fastify/busboy', version: '2.1.0' }
];

// 主函数
async function main() {
  console.log('==============================================');
  console.log('代理设置和依赖安装工具');
  console.log('==============================================');
  
  // 1. 检测当前代理设置
  console.log('当前代理设置:');
  if (HTTP_PROXY) {
    console.log(`- HTTP_PROXY: ${HTTP_PROXY}`);
    console.log(`- HTTPS_PROXY: ${process.env.HTTPS_PROXY || '未设置'}`);
  } else {
    console.log('未检测到代理设置');
    console.log(`将使用默认代理: ${DEFAULT_PROXY}`);
  }
  
  // 2. 安装必要的依赖
  console.log('\n开始安装依赖...');
  
  for (const dep of DEPENDENCIES) {
    console.log(`\n安装 ${dep.name}@${dep.version}...`);
    
    try {
      // 创建目录
      const depDir = dep.name.startsWith('@') 
        ? path.join(process.cwd(), 'node_modules', dep.name.split('/')[0], dep.name.split('/')[1])
        : path.join(process.cwd(), 'node_modules', dep.name);
      
      await fs.mkdir(depDir, { recursive: true });
      
      // 下载并解压
      const tarballUrl = dep.name.startsWith('@')
        ? `https://registry.npmjs.org/${encodeURIComponent(dep.name)}/-/${dep.name.split('/')[1]}-${dep.version}.tgz`
        : `https://registry.npmjs.org/${dep.name}/-/${dep.name}-${dep.version}.tgz`;
      
      console.log(`从 ${tarballUrl} 下载...`);
      
      // 使用curl下载并解压
      const stripComponents = dep.name.startsWith('@') ? 2 : 1;
      const curlCmd = `curl -L ${tarballUrl} | tar -xz -C ${depDir} --strip-components=${stripComponents}`;
      
      const { stdout, stderr } = await execAsync(curlCmd);
      console.log(`${dep.name} 安装完成!`);
    } catch (error) {
      console.error(`安装 ${dep.name} 失败:`, error);
      console.log('尝试使用备用方式安装...');
      
      try {
        // 尝试使用npm安装到本地目录
        const npmCmd = `npm install ${dep.name}@${dep.version} --no-save --prefix ./node_modules/${dep.name}-temp`;
        await execAsync(npmCmd);
        console.log(`${dep.name} 备用安装完成!`);
      } catch (npmError) {
        console.error(`备用安装 ${dep.name} 失败:`, npmError);
      }
    }
  }
  
  console.log('\n所有依赖安装完成!');
  
  // 3. 测试代理连接
  console.log('\n测试代理连接...');
  const proxy = HTTP_PROXY || DEFAULT_PROXY;
  
  try {
    const testCmd = `curl -s -o /dev/null -w "%{http_code}" -x ${proxy} https://api.openai.com`;
    const { stdout } = await execAsync(testCmd);
    
    const statusCode = stdout.trim();
    if (statusCode.startsWith('2') || statusCode.startsWith('3') || statusCode === '401') {
      console.log(`代理连接成功! 状态码: ${statusCode}`);
    } else {
      console.warn(`代理连接返回非成功状态码: ${statusCode}`);
    }
  } catch (error) {
    console.error('代理连接测试失败:', error);
  }
  
  // 4. 创建帮助脚本
  console.log('\n创建代理启动脚本...');
  
  const startWithProxyScript = `#!/bin/bash
# 使用代理启动任务处理器和监控器
export HTTP_PROXY=${proxy}
export HTTPS_PROXY=${proxy}

echo "启动任务处理器和监控器，使用代理: ${proxy}"

# 停止现有进程
pkill -f "task-processor.mjs" || true
pkill -f "monitor-tasks.mjs" || true

# 启动任务处理器
nohup node scripts/task-processor.mjs > task-processor.log 2>&1 &
echo "任务处理器已在后台启动，日志输出到 task-processor.log"

# 启动监控器
nohup node scripts/monitor-tasks.mjs > task-monitor.log 2>&1 &
echo "任务监控器已在后台启动，日志输出到 task-monitor.log"

echo "所有服务已启动!"
`;
  
  await fs.writeFile('start-with-proxy.sh', startWithProxyScript);
  await execAsync('chmod +x start-with-proxy.sh');
  console.log('代理启动脚本已创建: start-with-proxy.sh');
  
  console.log('\n设置完成! 您可以使用以下命令启动服务:');
  console.log('./start-with-proxy.sh');
}

// 运行主函数
main().catch(console.error);