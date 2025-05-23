# 日志系统

本项目使用了一个统一的日志系统来记录应用运行时的各种信息。

## 日志级别

日志系统支持以下级别，按严重程度从低到高排序：

* **DEBUG (0)** - 详细的调试信息，包括底层实现细节和临时状态
* **INFO (1)** - 常规操作信息，表示正常的系统状态变化
* **WARN (2)** - 警告信息，表示潜在问题，但不影响系统的主要功能
* **ERROR (3)** - 错误信息，表示影响功能的错误

## 配置日志级别

可以通过环境变量 `LOG_LEVEL` 来配置日志级别，值对应上述级别的数字：

```sh
# 在 .env 或 .env.local 文件中设置
LOG_LEVEL=1  # 1 表示 INFO 级别
```

- 生产环境推荐使用 `1` (INFO) 或 `2` (WARN)
- 开发环境可以使用 `0` (DEBUG) 获取更详细的信息

如果未设置 `LOG_LEVEL` 环境变量：
- 生产环境默认使用 `INFO` 级别
- 开发环境默认使用 `DEBUG` 级别

## 日志内容安全处理

日志系统内置了对敏感信息的保护机制：

1. **Base64 图片处理** - 所有 Base64 编码的图片数据在记录日志时会被自动转换为安全摘要，只包含类型、大小等信息，而不记录完整的 Base64 内容。

2. **长字符串截断** - 超长的字符串（例如提示词、API 响应等）会被自动截断，以避免日志过于冗长。

3. **敏感数据过滤** - API 密钥等敏感信息会在记录前被过滤掉。

## 使用日志工具

在代码中使用日志工具：

```typescript
import { createLogger } from '@/utils/logger';

// 创建指定模块的日志记录器
const logger = createLogger('模块名称');

// 使用不同级别记录日志
logger.debug('调试信息...');
logger.info('常规信息...');
logger.warn('警告信息...');
logger.error('错误信息...');

// 记录任务进度里程碑 (只记录关键进度点)
logger.progress('task-123', 50, 'processing');

// 记录性能信息
const startTime = Date.now();
// ... 执行操作 ...
logger.timing('操作名称', Date.now() - startTime);

// 记录包含敏感内容的信息
import { createSafeSummary } from '@/utils/logger';
logger.debug(`Base64图片: ${createSafeSummary(base64String)}`);
```

## 进度日志优化

为了减少不必要的进度日志记录，系统会自动：

1. 只记录重要的进度里程碑（0%、50%、100% 等 10% 的整数倍）
2. 记录阶段变化点
3. 记录开始和完成状态

## 性能监控

日志系统还集成了简单的性能监控功能，可以记录关键操作的执行时间。 