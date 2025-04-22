# OAuth 登录配置指南

## 问题概述

在使用 Google OAuth 登录时，存在以下问题：
1. 认证重定向后会话状态不一致
2. 无法正确保持登录状态
3. 多个 Supabase 客户端实例冲突

## 解决方案

### 1. 配置 Supabase 客户端 (已实现)

- 使用单例模式确保只有一个 Supabase 客户端实例
- 配置统一的 OAuth 回调 URL
- 添加会话状态变化监听

### 2. 创建专用 OAuth 回调处理路由 (已实现)

- 使用 `app/auth/callback/route.ts` 处理所有 OAuth 回调
- 统一设置认证 Cookie
- 处理重定向

### 3. 部署配置

请确保在 Vercel 部署时配置以下环境变量：

```
NEXT_PUBLIC_SUPABASE_URL=你的Supabase项目URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的Supabase匿名密钥
NEXT_PUBLIC_SITE_URL=你的应用部署URL (可选)
```

如果不设置 `NEXT_PUBLIC_SITE_URL`，系统将使用请求的 origin 作为重定向 URL。

### 4. 登录流程

现在的 OAuth 登录流程如下：

1. 用户点击 Google 登录按钮
2. Supabase 处理 OAuth 认证流程
3. Google 重定向回应用的 `/auth/callback` 路由
4. 回调路由处理认证状态，设置 Cookie 并重定向到主页
5. 用户成功登录并保持登录状态

## 故障排除

如果登录过程中遇到问题，请检查：

1. 浏览器控制台是否有错误日志
2. 确认环境变量配置正确
3. 检查 Supabase 项目的 OAuth 提供商配置，确保允许的重定向 URL 包含 `https://your-domain.com/auth/callback`
4. 清除浏览器缓存和 Cookie 后重试 