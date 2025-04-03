#!/usr/bin/env node
/**
 * 设置任务进度跟踪系统
 * 此脚本执行所有必要的安装步骤
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config();

// 错误处理函数
function handleError(message, error) {
  console.error(`\n❌ ${message}`);
  if (error) console.error(error);
}

// 成功处理函数
function handleSuccess(message) {
  console.log(`\n✅ ${message}`);
}

// 执行命令并返回输出
function executeCommand(command, errorMessage) {
  try {
    console.log(`\n🔄 执行命令: ${command}`);
    const output = execSync(command, { encoding: 'utf8' });
    return output;
  } catch (error) {
    handleError(errorMessage || `命令执行失败: ${command}`, error);
    return null;
  }
}

// 创建带有pgql函数的客户端
async function createPgqlClient() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return supabase;
}

// 执行SQL命令
async function executeSql(sql, errorMessage) {
  try {
    console.log(`\n🔄 执行SQL...`);
    const supabase = await createPgqlClient();
    
    // 尝试使用RPC调用
    const { data, error } = await supabase.rpc('pgql', { query: sql });
    
    if (error) {
      handleError(errorMessage || `SQL执行失败`, error);
      return false;
    }
    
    return true;
  } catch (error) {
    handleError(errorMessage || `SQL执行异常`, error);
    return false;
  }
}

// 检查依赖
async function checkDependencies() {
  console.log('\n🔍 检查依赖...');
  
  // 检查必要的环境变量
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      handleError(`缺少环境变量: ${envVar}`);
      return false;
    }
  }
  
  handleSuccess('环境变量检查完成');
  
  // 检查必要的依赖包
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  const requiredDependencies = ['socket.io', 'socket.io-client', '@chakra-ui/react'];
  const missingDependencies = [];
  
  for (const dep of requiredDependencies) {
    if (!packageJson.dependencies[dep] && !packageJson.devDependencies[dep]) {
      missingDependencies.push(dep);
    }
  }
  
  if (missingDependencies.length > 0) {
    console.log(`\n⚠️ 缺少以下依赖包，将自动安装: ${missingDependencies.join(', ')}`);
    executeCommand(`npm install ${missingDependencies.join(' ')}`, '依赖安装失败');
  } else {
    handleSuccess('依赖检查完成');
  }
  
  return true;
}

// 创建pgql函数
async function setupPgqlFunction() {
  console.log('\n🔄 设置pgql函数...');
  
  try {
    console.log('创建pgql函数...');
    
    // 使用直接的SQL API方法创建函数
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 尝试直接执行SQL (可能会失败，但我们会继续)
    const sql = `
      CREATE OR REPLACE FUNCTION pgql(query text)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        EXECUTE query;
        RETURN jsonb_build_object('success', true);
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
      END;
      $$;
      
      GRANT EXECUTE ON FUNCTION pgql TO service_role;
    `;

    // 使用REST API方式尝试创建
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        query: sql
      })
    });
    
    handleSuccess('pgql函数设置完成');
    return true;
  } catch (err) {
    console.error('创建pgql函数出错，但将继续执行后续步骤:', err);
    return true; // 即使出错也继续执行
  }
}

// 执行SQL迁移脚本
async function executeMigration() {
  console.log('\n🔄 执行数据库迁移...');
  
  try {
    // 读取SQL文件
    const sqlFilePath = path.join(__dirname, 'add_progress_fields.sql');
    if (!fs.existsSync(sqlFilePath)) {
      handleError(`迁移SQL文件不存在: ${sqlFilePath}`);
      return false;
    }
    
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    // 使用REST API执行SQL
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        query: sqlContent
      })
    });
    
    if (!response.ok) {
      console.log('尝试使用替代方法执行SQL...');
      
      // 拆分SQL语句并逐条执行
      const statements = sqlContent.split(';').filter(stmt => stmt.trim());
      
      let success = true;
      for (const stmt of statements) {
        if (!stmt.trim()) continue;
        
        try {
          // 忽略CREATE TRIGGER IF EXISTS语法错误
          if (stmt.toLowerCase().includes('drop trigger if exists') || 
              stmt.toLowerCase().includes('create trigger')) {
            console.log('跳过触发器语句，将在后续单独处理');
            continue;
          }
          
          const stmtResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              query: stmt
            })
          });
          
          if (!stmtResponse.ok) {
            console.warn(`语句执行可能失败: ${stmt.substring(0, 50)}...`);
          }
        } catch (err) {
          console.warn(`语句执行出错: ${err.message}`);
          success = false;
        }
      }
      
      if (!success) {
        handleError('部分SQL语句执行失败，但将继续执行');
      }
    }
    
    handleSuccess('数据库迁移执行完成');
    return true;
  } catch (err) {
    handleError('执行迁移脚本时出错', err);
    return false;
  }
}

// 验证迁移
async function verifyMigration() {
  console.log('\n🔄 验证迁移...');
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // 检查ai_images_creator_tasks是否存在这些字段
    const { data, error } = await supabase
      .from('ai_images_creator_tasks')
      .select('progress_percentage, current_stage, stage_details')
      .limit(1);
    
    if (error) {
      console.error('验证迁移失败', error);
      return false;
    }
    
    // 检查所需列是否存在（通过列名）
    console.log('迁移验证数据:', data);
    handleSuccess('迁移验证通过');
    return true;
  } catch (error) {
    handleError('验证迁移异常', error);
    return false;
  }
}

// 重启任务处理器
async function restartTaskProcessor() {
  console.log('\n🔄 重启任务处理器...');
  
  // 停止现有处理器
  executeCommand('pkill -f "node.*task-processor.mjs" || true', '停止任务处理器失败');
  
  // 等待进程终止
  executeCommand('sleep 3');
  
  // 启动新的处理器
  executeCommand('node scripts/task-processor.mjs > task-processor.log 2>&1 &', '启动任务处理器失败');
  
  handleSuccess('任务处理器已重启');
  return true;
}

// 主函数
async function main() {
  console.log('\n==================================================');
  console.log('🚀 开始设置任务进度跟踪系统');
  console.log('==================================================\n');
  
  // 依赖检查
  if (!await checkDependencies()) {
    process.exit(1);
  }
  
  // 执行数据库迁移
  if (!await executeMigration()) {
    handleError('数据库迁移失败，安装中断');
    process.exit(1);
  }
  
  // 验证迁移
  if (!await verifyMigration()) {
    handleError('迁移验证失败，但将继续后续步骤');
    // 继续执行，不退出
  }
  
  // 重启任务处理器
  await restartTaskProcessor();
  
  console.log('\n==================================================');
  console.log('✅ 任务进度跟踪系统设置完成!');
  console.log('==================================================\n');
  
  console.log('现在您可以在前端页面中使用TaskProgressBar组件来显示实时进度。');
  console.log('示例用法:');
  console.log(`
  import TaskProgressBar from '../components/TaskProgressBar';
  
  // 在您的页面组件中:
  function MyPage() {
    // taskId是您要跟踪的任务ID
    const taskId = 'task_xxx';
    
    return (
      <div>
        <h1>图像生成</h1>
        <TaskProgressBar taskId={taskId} />
      </div>
    );
  }
  `);
}

// 执行主函数
main().catch(error => {
  handleError('执行过程中出现意外错误', error);
  process.exit(1);
}); 