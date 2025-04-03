#!/bin/bash
cd "/Users/zhongqingbiao/Downloads/ai_images_zhushou" || exit
echo "启动任务处理器..."
nohup node "/Users/zhongqingbiao/Downloads/ai_images_zhushou/scripts/task-processor.mjs" > "/Users/zhongqingbiao/Downloads/ai_images_zhushou/logs/task-processor.log" 2>&1 &
echo $! > "/Users/zhongqingbiao/Downloads/ai_images_zhushou/task-processor.pid"
echo "任务处理器已启动，PID: $(cat "/Users/zhongqingbiao/Downloads/ai_images_zhushou/task-processor.pid")"
