const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('正在应用任务表更新...');

// 获取Supabase URL和密钥
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('缺少SUPABASE_URL或SUPABASE_SERVICE_ROLE_KEY环境变量');
  process.exit(1);
}

// 读取SQL文件
const tasksSql = fs.readFileSync(path.join(__dirname, '../sql/ai_images_creator_tasks.sql'), 'utf8');

// 使用psql执行SQL命令
try {
  // 提取域名和数据库信息
  const urlMatch = SUPABASE_URL.match(/https:\/\/([^\.]+)\.supabase\.co/);
  if (!urlMatch) {
    throw new Error('无法从SUPABASE_URL中提取项目ID');
  }
  
  const projectId = urlMatch[1];
  const connectionString = `postgres://postgres:${SUPABASE_SERVICE_KEY}@db.${projectId}.supabase.co:5432/postgres`;

  // 将SQL命令写入临时文件
  const tempSqlPath = path.join(__dirname, 'temp-tasks.sql');
  fs.writeFileSync(tempSqlPath, tasksSql);

  // 执行SQL命令
  console.log('正在执行SQL命令...');
  const output = execSync(`cat ${tempSqlPath} | psql "${connectionString}"`, { encoding: 'utf8' });
  console.log(output);

  // 删除临时文件
  fs.unlinkSync(tempSqlPath);
  
  console.log('任务表更新成功！');
} catch (error) {
  console.error('应用任务表更新时出错:', error);
  process.exit(1);
} 