# AI图像生成助手 - 代理配置和系统监控指南

## 问题解决方案总结

我们通过深入分析和测试，发现并解决了系统中的几个关键问题：

1. **OpenAI API连接问题**：在中国内地环境下，没有代理配置时无法正常连接到OpenAI API，导致任务卡在"处理中"状态。
2. **错误处理机制不完善**：系统缺乏对API调用失败的有效检测和自动恢复机制。
3. **监控系统缺失**：没有定期检查卡住任务的机制，导致问题积累。

## 系统改进

我们实施了以下改进：

1. **添加代理支持**：所有API调用均添加了HTTP代理支持，允许通过代理服务器访问OpenAI API。
2. **增强错误处理**：为API调用添加了超时、重试和详细的错误捕获机制。
3. **创建自动监控系统**：实现了定期检查任务状态和自动修复卡住任务的机制。
4. **系统自愈能力**：在任务处理器异常停止时自动重启。

## 使用方法

### 设置HTTP代理

要使系统正常工作，需要配置HTTP代理。有几种方式：

#### 临时设置（当前会话）

```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
```

#### 永久设置（所有会话）

编辑`~/.zshrc`或`~/.bash_profile`文件，添加：

```bash
# 设置HTTP代理
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
```

然后执行`source ~/.zshrc`使配置生效。

#### 在运行时指定

```bash
HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 node scripts/task-processor.mjs
```

### 安装并启动监控系统

1. **安装监控系统**

   ```bash
   ./scripts/monitoring-setup.sh
   ```

   此脚本将自动完成：
   - 安装必要依赖
   - 创建管理脚本
   - 设置crontab定时任务
   - 配置日志目录

2. **管理监控系统**

   安装完成后，可以使用这些脚本管理系统：

   - 启动任务处理器：`./scripts/start-processor.sh`
   - 停止任务处理器：`./scripts/stop-processor.sh`
   - 检查系统状态：`./scripts/check-status.sh`

3. **修复卡住的任务**

   手动修复卡住的任务：

   ```bash
   HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 node scripts/fix-stuck-tasks.mjs
   ```

## 系统组件

### 1. 任务处理器 (task-processor.mjs)

负责从数据库中获取待处理的任务并执行处理。主要改进：
- 添加代理支持
- 增加错误重试机制
- 添加超时和自动恢复机制

### 2. 任务监控器 (monitor-tasks.mjs)

定期检查数据库中的任务状态，发现并修复卡住的任务。功能：
- 每5分钟检查一次任务状态
- 自动修复超过20分钟未完成的任务
- 检查任务处理器状态并自动重启
- 生成详细的日志记录

### 3. 修复工具 (fix-stuck-tasks.mjs)

用于手动或自动修复卡住的任务：
- 识别处于"processing"状态过长的任务
- 将状态更新为"failed"
- 退还用户积分
- 记录详细的修复日志

### 4. 系统设置脚本 (monitoring-setup.sh)

自动设置监控系统的脚本：
- 创建必要的目录和权限
- 设置crontab定时任务
- 生成管理脚本

## 日志和监控

- **监控日志**：所有监控活动被记录到`task-monitor.log`文件中
- **任务处理器日志**：任务处理活动被记录到`task-processor.log`文件中
- **健康检查记录**：系统健康检查结果保存在内存中，限保留最近10条记录

## 疑难解答

### 常见问题

1. **无法连接到OpenAI API**
   
   检查代理配置是否正确，可以使用以下命令测试：
   ```bash
   curl --proxy http://127.0.0.1:7890 https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

2. **任务仍然卡住**
   
   手动运行修复工具：
   ```bash
   HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 node scripts/fix-stuck-tasks.mjs
   ```

3. **监控器没有自动启动**
   
   检查crontab是否正确设置：
   ```bash
   crontab -l | grep monitor-tasks
   ```

### 诊断命令

- 检查系统状态：`./scripts/check-status.sh`
- 测试API连接：`HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 node scripts/simple-test.mjs`
- 查看监控日志：`tail -f task-monitor.log`
- 查看处理器日志：`tail -f task-processor.log`

## 维护建议

1. 定期检查日志文件，确保系统正常运行
2. 每周重启任务处理器，避免潜在的内存泄漏
3. 定期测试API连接，确保代理配置正常工作
4. 根据系统负载调整配置参数，如检查间隔、超时时间等 