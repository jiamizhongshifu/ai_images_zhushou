# AI图像助手开发指南

## 技术架构概述

AI图像助手是基于Next.js框架开发的现代Web应用，采用React前端配合Supabase后端服务，集成了AI图像生成API，提供图片风格转换功能。

### 技术栈

- **前端框架**：Next.js 14 (App Router)
- **UI组件**：定制UI组件库
- **状态管理**：React Hooks
- **后端服务**：Supabase (身份验证、数据库、存储)
- **AI集成**：OpenAI图像生成API
- **部署**：Vercel/自定义服务器

## 代码结构

### 目录组织

```
/
├── app/                    # Next.js应用路由
│   ├── api/                # API路由
│   │   ├── auth/           # 认证相关API
│   │   ├── credits/        # 积分管理API
│   │   ├── generate-image-direct/ # 图像生成API
│   │   └── history/        # 历史记录API
│   ├── protected/          # 登录后访问的页面
│   └── ...                 # 其他页面
├── components/             # React组件
│   ├── creation/           # 图像创建相关组件
│   ├── ui/                 # 通用UI组件
│   └── ...                 # 其他组件
├── hooks/                  # 自定义React Hooks
├── lib/                    # 工具函数库
├── utils/                  # 通用工具函数
├── public/                 # 静态资源
└── ...                     # 配置文件
```

### 核心模块

1. **认证系统** (`utils/auth-service.ts`)：
   - 提供统一的认证状态管理
   - 支持多层存储和优雅降级
   - 实现身份验证恢复机制

2. **图像生成** (`hooks/useImageGeneration.ts` + `app/api/generate-image-direct`)：
   - 前端生成请求处理
   - 生成状态管理
   - 后端API代理和错误处理

3. **UI组件系统** (`components/ui/`)：
   - 响应式容器组件
   - 图片加载和展示组件
   - 骨架屏和加载状态

4. **业务逻辑** (`hooks/` 目录)：
   - 用户积分管理
   - 图像历史记录
   - 通知系统

## 扩展开发指南

### 添加新风格

1. 修改 `app/config/styles.ts` 文件，添加新的风格定义：

```typescript
export const STYLES = [
  // 已有风格
  {
    id: "新风格名称",
    title: "风格显示名称",
    description: "风格描述文本",
    promptPrefix: "风格提示词前缀",
    promptSuffix: "风格提示词后缀",
    imageUrl: "/path/to/style-example.jpg"
  }
];
```

2. 在 `generatePromptWithStyle` 函数中添加新风格的处理逻辑

### 增加模型支持

1. 在 `components/creation/model-selection.tsx` 中添加新模型选项
2. 在 `app/api/generate-image-direct/route.ts` 中实现新模型的API调用

### 自定义UI组件

遵循现有的组件设计模式，在 `components/ui/` 目录创建新组件：

```tsx
import { cn } from "@/lib/utils";

interface MyComponentProps {
  // 组件参数定义
}

export function MyComponent({
  // 参数解构
}: MyComponentProps) {
  // 组件实现
  return (
    <div className={cn("基础样式类")}>
      {/* 组件内容 */}
    </div>
  );
}
```

### 添加新的页面

1. 在 `app/` 目录下创建对应路由的目录和 `page.tsx` 文件
2. 实现页面组件，通常需要使用 `"use client"` 指令

```tsx
"use client";

import { useState, useEffect } from "react";
// 引入所需组件和hooks

export default function NewPage() {
  // 页面实现
  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="max-w-7xl w-full px-4 py-8">
        {/* 页面内容 */}
      </div>
    </div>
  );
}
```

## 开发最佳实践

### 响应式设计原则

1. 使用 `ResponsiveContainer` 组件包裹页面内容
2. 遵循移动优先的设计理念
3. 使用 `flex` 和 `grid` 布局实现自适应界面
4. 关键组件添加合适的 `padding` 和 `margin`

```tsx
<ResponsiveContainer 
  maxWidth="7xl" 
  fullWidth={true} 
  padding="md"
>
  {/* 内容 */}
</ResponsiveContainer>
```

### 状态管理

1. 使用 React Hooks 管理组件状态
2. 复杂组件分离业务逻辑到自定义 Hooks
3. 通过上下文API共享跨组件状态

### 性能优化

1. 使用 `useMemo` 和 `useCallback` 减少不必要的重渲染
2. 实现组件懒加载：
   ```tsx
   const DynamicComponent = dynamic(() => import("@/components/HeavyComponent"), {
     loading: () => <LoadingPlaceholder />
   });
   ```
3. 使用 `LazyImage` 组件延迟加载图片
4. 添加合理的缓存策略

### 错误处理

1. 使用 `try/catch` 捕获异常
2. 实现回退UI展示
3. 提供明确的错误提示
4. 记录错误日志便于调试

```tsx
try {
  // 可能出错的操作
} catch (error) {
  console.error("操作失败:", error);
  setError("用户友好的错误信息");
  // 显示错误UI
}
```

## API集成开发

### 添加新的API端点

1. 在 `app/api/` 目录创建新的API路由
2. 实现 API 处理函数
3. 添加认证中间件和错误处理

```tsx
// app/api/new-endpoint/route.ts
import { NextRequest } from 'next/server';
import { authMiddleware } from '@/app/api/auth-middleware';

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const { authorized, userId } = await authMiddleware(request);
    if (!authorized) {
      return new Response(JSON.stringify({ success: false, error: "未授权访问" }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 解析请求体
    const data = await request.json();
    
    // 处理业务逻辑
    
    // 返回结果
    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("API错误:", error);
    return new Response(JSON.stringify({ success: false, error: "处理请求失败" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

### 跨浏览器兼容性

1. 使用 `polyfill` 处理浏览器差异
2. 测试主流浏览器的兼容性
3. 使用渐进增强原则

## 部署指南

### Vercel部署

1. 连接GitHub仓库
2. 配置环境变量
3. 自定义构建命令

### 自定义服务器部署

1. 构建项目：`npm run build`
2. 配置环境变量
3. 启动服务：`npm start`

### 环境变量配置

关键环境变量：
```
NEXT_PUBLIC_SUPABASE_URL=***
NEXT_PUBLIC_SUPABASE_ANON_KEY=***
SUPABASE_SERVICE_ROLE_KEY=***
TUZI_API_KEY=***
TUZI_BASE_URL=***
```

## 调试技巧

1. 使用浏览器开发工具监控网络请求
2. 检查状态变化和组件重渲染
3. 使用 React DevTools 分析组件树
4. 查看服务端日志定位API问题

## 安全注意事项

1. 所有用户输入必须验证和净化
2. 敏感API需要认证保护
3. 实现速率限制防止滥用
4. 定期更新依赖库修复安全漏洞

## 贡献指南

1. 遵循项目的代码风格和组织方式
2. 添加适当的注释和文档
3. 编写单元测试覆盖关键功能
4. 提交前检查代码质量 