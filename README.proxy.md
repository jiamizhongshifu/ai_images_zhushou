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

# 代理配置与依赖问题解决方案

## 问题概述

AI 图像生成助手在中国大陆环境下无法正常连接 OpenAI API，导致任务卡在 "processing" 状态。主要原因是：

1. 在中国大陆无法直接连接 OpenAI API，需要使用代理
2. 系统尝试使用 `undici` 库配置 HTTP 代理，但缺少必要的依赖，导致错误：
   ```
   配置代理失败: Cannot find package 'undici' imported from /Users/.../scripts/task-processor.mjs，将尝试直接连接
   ```
3. 即使安装了 `undici`，还会缺少其依赖 `@fastify/busboy` 

## 解决方案

我们创建了一个完整的解决方案，包括：

1. 手动安装所需依赖
2. 修改代码以适应本地安装的依赖
3. 创建自动化脚本简化部署流程

### 自动化安装和配置

使用自动化脚本 `scripts/setup-proxy.mjs` 来安装依赖并配置代理：

```bash
# 给脚本添加执行权限
chmod +x scripts/setup-proxy.mjs

# 运行安装脚本
node scripts/setup-proxy.mjs
```

该脚本会：
- 检测当前代理设置
- 安装 `undici` 和 `@fastify/busboy` 依赖
- 测试代理连接
- 创建启动脚本 `start-with-proxy.sh`

### 启动服务

使用生成的启动脚本启动服务：

```bash
./start-with-proxy.sh
```

这将使用配置好的代理启动任务处理器和监控器，并将日志输出到 `task-processor.log` 和 `task-monitor.log`。

### 手动安装（如需要）

如果自动化脚本失败，可以手动安装依赖：

```bash
# 安装 undici
mkdir -p ./node_modules/undici
curl -L https://registry.npmjs.org/undici/-/undici-5.28.2.tgz | tar -xz -C ./node_modules/undici --strip-components=1

# 安装 @fastify/busboy
mkdir -p ./node_modules/@fastify/busboy
curl -L https://registry.npmjs.org/@fastify/busboy/-/busboy-2.1.0.tgz | tar -xz -C ./node_modules/@fastify/busboy --strip-components=1
```

## 代码修改

我们修改了以下文件以优化代理配置：

1. `scripts/task-processor.mjs`:
   - 改进 undici 导入逻辑，支持从本地路径导入
   - 添加更详细的错误信息输出

2. `scripts/monitor-tasks.mjs`:
   - 同样改进了 undici 导入逻辑
   - 确保退款请求支持代理

3. 新增 `scripts/setup-proxy.mjs`:
   - 自动化安装和配置
   - 代理连接测试
   - 创建便捷启动脚本

## 使用说明

### 代理配置

您可以通过以下方式设置代理：

1. 临时设置（当前会话有效）:
   ```bash
   export HTTP_PROXY=http://127.0.0.1:7890
   export HTTPS_PROXY=http://127.0.0.1:7890
   ```

2. 永久设置（修改 `~/.zshrc` 或 `~/.bash_profile`）:
   ```bash
   echo 'export HTTP_PROXY=http://127.0.0.1:7890' >> ~/.zshrc
   echo 'export HTTPS_PROXY=http://127.0.0.1:7890' >> ~/.zshrc
   source ~/.zshrc
   ```

3. 运行时指定:
   ```bash
   HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 node scripts/task-processor.mjs
   ```

### 检查服务状态

检查服务是否正常运行：

```bash
# 检查任务处理器
ps aux | grep "[t]ask-processor.mjs"

# 检查监控器
ps aux | grep "[m]onitor-tasks.mjs"

# 查看任务处理器日志
tail -f task-processor.log

# 查看监控器日志
tail -f task-monitor.log
```

## 故障排除

如果仍然遇到问题，可以尝试：

1. 确认代理服务可用：
   ```bash
   curl -x http://127.0.0.1:7890 https://api.openai.com/v1/models
   ```

2. 检查依赖安装：
   ```bash
   node scripts/test-undici.mjs
   ```

3. 重启服务：
   ```bash
   pkill -f "task-processor.mjs" || true
   pkill -f "monitor-tasks.mjs" || true
   ./start-with-proxy.sh
   ```

4. 清除并重新安装依赖：
   ```bash
   rm -rf node_modules/undici node_modules/@fastify
   node scripts/setup-proxy.mjs
   ```

## 测试结果

我们已经确认此解决方案可以：

1. 成功安装所需依赖
2. 正确导入 undici 库和 Agent 类
3. 成功配置代理
4. 使任务处理器和监控器正常运行

此修复应该可以解决由于代理配置失败导致的任务卡住问题。 