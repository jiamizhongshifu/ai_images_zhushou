#!/bin/bash
# 使用代理启动任务处理器和监控器
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890

echo "启动任务处理器和监控器，使用代理: http://127.0.0.1:7890"

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
