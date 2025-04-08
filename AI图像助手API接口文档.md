# AI图像助手API接口文档

## 系统概述

AI图像助手是一个提供图片风格转换功能的应用程序，用户可以上传照片，选择不同的艺术风格，通过AI技术生成新的风格化图片。

## 核心组件结构

### 前端组件

#### 创建页面组件
- `components/creation/generated-image-gallery.tsx` - 生成图片展示组件
- `components/creation/image-uploader.tsx` - 图片上传组件
- `components/creation/style-card.tsx` - 风格卡片组件
- `components/creation/style-selector.tsx` - 风格选择器组件
- `components/creation/prompt-input.tsx` - 提示词输入组件
- `components/creation/model-selection.tsx` - 模型选择组件

#### UI组件
- `components/ui/responsive-container.tsx` - 响应式容器组件
- `components/ui/skeleton-generation.tsx` - 生成状态骨架屏组件
- `components/ui/lazy-image.tsx` - 懒加载图片组件
- `components/ui/loading-states.tsx` - 加载状态组件

### 页面
- `app/protected/page.tsx` - 主创建页面
- `app/protected/history` - 历史记录页面

### Hooks
- `hooks/useImageGeneration.ts` - 处理图像生成的逻辑
- `hooks/useImageHistory.ts` - 处理历史记录
- `hooks/useUserCredits.ts` - 处理用户积分
- `hooks/useImageHandling.ts` - 处理图像加载和下载
- `hooks/useNotification.ts` - 处理通知消息

## API接口

### 图像生成接口

#### 请求
```
POST /api/generate-image-direct
```

#### 请求体
```json
{
  "prompt": "详细的图像描述",
  "image": "可选，Base64编码的图片",
  "style": "可选，预定义风格如'皮克斯'、'新海诚'等",
  "aspectRatio": "可选，原始图片比例，如'16:9'",
  "standardAspectRatio": "可选，标准化的图片比例"
}
```

#### 响应
```json
{
  "success": true,
  "imageUrl": "生成图片的URL",
  "message": "成功信息"
}
```

或错误响应：
```json
{
  "success": false,
  "error": "错误信息",
  "suggestion": "可选，改进提示词的建议"
}
```

### 用户积分接口

#### 请求
```
GET /api/credits/balance
```

#### 响应
```json
{
  "success": true,
  "credits": 100
}
```

### 图片历史记录接口

#### 请求
```
GET /api/history/images
```

#### 响应
```json
{
  "success": true,
  "images": [
    {
      "id": "图片ID",
      "url": "图片URL",
      "prompt": "生成提示词",
      "style": "使用的风格",
      "createdAt": "创建时间"
    }
  ]
}
```

## 使用流程

1. 用户登录系统（通过auth-service管理认证状态）
2. 进入创建页面
3. 上传参考图片和/或输入提示词
4. 选择期望的艺术风格
5. 点击生成按钮
6. 系统消耗用户积分
7. 显示生成进度（准备参数、发送请求、AI处理中等）
8. 生成完成后展示图片结果
9. 用户可以下载图片或查看历史记录

## 生成状态流程

生成过程中会经历以下几个阶段：
1. preparing (5%) - 准备参数
2. configuring (10%) - 配置API
3. sending_request (20%) - 发送请求
4. processing (60%) - AI处理中
5. extracting_image (85%) - 提取图像
6. finalizing (95%) - 完成处理
7. completed (100%) - 图像生成完成

## 错误处理

系统实现了多层次的错误处理：
1. 内容政策违规检测 - 检查提示词是否符合内容政策
2. 网络错误处理 - 处理API请求过程中的网络问题
3. 积分不足提示 - 在积分不足时提示用户充值
4. 图像加载错误处理 - 处理图像加载失败的情况

## 认证系统

系统使用多层认证机制确保用户登录状态：
1. 内存缓存 - 快速检查认证状态
2. 本地存储 - 持久化认证状态
3. API验证 - 服务器端验证
4. 降级策略 - 当认证系统遇到问题时提供备选方案 