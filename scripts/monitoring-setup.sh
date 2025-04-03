#!/bin/bash

# 监控系统设置脚本
# 创建crontab条目来定期运行监控脚本

# 获取当前脚本所在目录的绝对路径
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== 任务监控系统设置 ==="
echo "项目目录: $PROJECT_DIR"

# 确保有正确的Node.js环境
if ! command -v node &> /dev/null; then
  echo "错误: 未找到Node.js，请先安装Node.js"
  exit 1
fi

# 检查是否已安装必要的npm包
echo "检查依赖项..."
cd "$PROJECT_DIR" || exit
npm list dotenv @supabase/supabase-js || npm install dotenv @supabase/supabase-js

# 添加可执行权限
chmod +x "$SCRIPT_DIR/monitor-tasks.mjs"
chmod +x "$SCRIPT_DIR/task-processor.mjs"
chmod +x "$SCRIPT_DIR/fix-stuck-tasks.mjs"

# 创建日志目录
mkdir -p "$PROJECT_DIR/logs"

# 生成crontab条目
CRONTAB_ENTRY="*/5 * * * * cd $PROJECT_DIR && node $SCRIPT_DIR/monitor-tasks.mjs >> $PROJECT_DIR/logs/monitor.log 2>&1"
MONITOR_SERVICE="# 任务监控系统 - 每5分钟检查一次卡住的任务"

# 检查crontab中是否已经有相同的条目
if crontab -l 2>/dev/null | grep -F "$SCRIPT_DIR/monitor-tasks.mjs" > /dev/null; then
  echo "监控任务已存在于crontab中，跳过添加"
else
  # 添加到crontab
  (crontab -l 2>/dev/null; echo "$MONITOR_SERVICE"; echo "$CRONTAB_ENTRY") | crontab -
  echo "已添加监控任务到crontab"
fi

# 创建一个启动任务处理器的脚本
cat > "$SCRIPT_DIR/start-processor.sh" << EOF
#!/bin/bash
cd "$PROJECT_DIR" || exit
echo "启动任务处理器..."
nohup node "$SCRIPT_DIR/task-processor.mjs" > "$PROJECT_DIR/logs/task-processor.log" 2>&1 &
echo \$! > "$PROJECT_DIR/task-processor.pid"
echo "任务处理器已启动，PID: \$(cat "$PROJECT_DIR/task-processor.pid")"
EOF

# 创建一个停止任务处理器的脚本
cat > "$SCRIPT_DIR/stop-processor.sh" << EOF
#!/bin/bash
if [ -f "$PROJECT_DIR/task-processor.pid" ]; then
  PID=\$(cat "$PROJECT_DIR/task-processor.pid")
  if ps -p \$PID > /dev/null; then
    echo "停止任务处理器 (PID: \$PID)..."
    kill \$PID
    rm "$PROJECT_DIR/task-processor.pid"
    echo "任务处理器已停止"
  else
    echo "任务处理器未运行 (PID: \$PID 不存在)"
    rm "$PROJECT_DIR/task-processor.pid"
  fi
else
  echo "找不到任务处理器PID文件"
  # 尝试查找并停止所有任务处理器进程
  PIDS=\$(ps aux | grep task-processor.mjs | grep -v grep | awk '{print \$2}')
  if [ -n "\$PIDS" ]; then
    echo "找到任务处理器进程: \$PIDS"
    echo "正在停止..."
    kill \$PIDS
    echo "所有任务处理器进程已停止"
  else
    echo "未发现运行中的任务处理器进程"
  fi
fi
EOF

# 赋予脚本可执行权限
chmod +x "$SCRIPT_DIR/start-processor.sh"
chmod +x "$SCRIPT_DIR/stop-processor.sh"

# 创建一个状态检查脚本
cat > "$SCRIPT_DIR/check-status.sh" << EOF
#!/bin/bash
echo "=== 任务系统状态检查 ==="
date

# 检查监控器cron是否设置
if crontab -l 2>/dev/null | grep -F "$SCRIPT_DIR/monitor-tasks.mjs" > /dev/null; then
  echo "监控任务: 已设置 ✓"
else
  echo "监控任务: 未设置 ✗"
fi

# 检查任务处理器是否运行
if ps aux | grep task-processor.mjs | grep -v grep > /dev/null; then
  PIDS=\$(ps aux | grep task-processor.mjs | grep -v grep | awk '{print \$2}')
  echo "任务处理器: 运行中 ✓ (PID: \$PIDS)"
else
  echo "任务处理器: 未运行 ✗"
fi

# 检查卡住的任务
echo "检查卡住的任务..."
cd "$PROJECT_DIR" || exit
node -e "
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

async function checkStuckTasks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const thresholdTime = new Date();
  thresholdTime.setMinutes(thresholdTime.getMinutes() - 20);
  
  const { data, error } = await supabase
    .from('ai_images_creator_tasks')
    .select('task_id, status, created_at')
    .eq('status', 'processing')
    .lt('created_at', thresholdTime.toISOString());
  
  if (error) {
    console.error('查询失败:', error);
    return;
  }
  
  if (data && data.length > 0) {
    console.log(\`发现 \${data.length} 个卡住的任务:\`);
    data.forEach(task => {
      console.log(\`  - 任务ID: \${task.task_id}, 创建时间: \${task.created_at}\`);
    });
  } else {
    console.log('没有发现卡住的任务');
  }
}

checkStuckTasks()
  .catch(err => console.error('检查失败:', err));
"
EOF

chmod +x "$SCRIPT_DIR/check-status.sh"

echo
echo "=== 安装完成 ==="
echo "可以使用以下命令管理任务系统:"
echo "  - 启动任务处理器: $SCRIPT_DIR/start-processor.sh"
echo "  - 停止任务处理器: $SCRIPT_DIR/stop-processor.sh"
echo "  - 检查系统状态: $SCRIPT_DIR/check-status.sh"
echo
echo "监控系统已设置完成，将每5分钟检查一次卡住的任务"
echo "日志文件保存在: $PROJECT_DIR/logs/"
echo 