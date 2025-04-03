#!/bin/bash
if [ -f "/Users/zhongqingbiao/Downloads/ai_images_zhushou/task-processor.pid" ]; then
  PID=$(cat "/Users/zhongqingbiao/Downloads/ai_images_zhushou/task-processor.pid")
  if ps -p $PID > /dev/null; then
    echo "停止任务处理器 (PID: $PID)..."
    kill $PID
    rm "/Users/zhongqingbiao/Downloads/ai_images_zhushou/task-processor.pid"
    echo "任务处理器已停止"
  else
    echo "任务处理器未运行 (PID: $PID 不存在)"
    rm "/Users/zhongqingbiao/Downloads/ai_images_zhushou/task-processor.pid"
  fi
else
  echo "找不到任务处理器PID文件"
  # 尝试查找并停止所有任务处理器进程
  PIDS=$(ps aux | grep task-processor.mjs | grep -v grep | awk '{print $2}')
  if [ -n "$PIDS" ]; then
    echo "找到任务处理器进程: $PIDS"
    echo "正在停止..."
    kill $PIDS
    echo "所有任务处理器进程已停止"
  else
    echo "未发现运行中的任务处理器进程"
  fi
fi
