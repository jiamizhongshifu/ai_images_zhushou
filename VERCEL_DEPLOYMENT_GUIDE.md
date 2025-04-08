# Vercel部署指南

## 问题修复

我们修复了以下问题：

1. 添加了`"use client"`指令到`components/ui/use-toast.tsx`和`components/ui/enhanced-toast.tsx`文件，以解决React hooks在非客户端组件中使用的问题。
2. 添加了`.env.example`文件作为环境变量配置模板。

## 部署步骤

### 1. 使用Git Bundle部署

由于网络问题无法直接推送到GitHub，我们创建了Git bundle文件，您可以按照以下步骤使用：

```bash
# 在新目录中解包bundle
mkdir temp_deploy
cd temp_deploy
git clone toast_fix_with_env.bundle .

# 或者直接在本地仓库中应用更改
git bundle verify toast_fix_with_env.bundle
git fetch toast_fix_with_env.bundle main:fix-toast-branch
git checkout fix-toast-branch
```

然后将解包的代码推送到GitHub，或直接从本地部署到Vercel。

### 2. 配置Vercel环境变量

确保在Vercel项目设置中添加以下必要的环境变量：

```
# Supabase配置
NEXT_PUBLIC_SUPABASE_URL=your-actual-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key
SUPABASE_JWT_SECRET=your-actual-jwt-secret

# 图像AI服务配置
TUZI_API_KEY=your-actual-api-key
TUZI_API_URL=your-actual-api-url
TUZI_MODEL=gpt-4o-all

# 支付服务配置
ZPAY_PID=2025040215385823
NEXT_PUBLIC_ZPAY_PID=2025040215385823
```

### 3. 验证部署

部署后，访问以下URL确认Toast通知系统工作正常：

```
https://[your-vercel-domain]/toast-demo
```

## 故障排除

如果部署仍然失败，请检查以下事项：

1. 确认所有React组件文件中使用hooks的都已添加`"use client"`指令
2. 验证所有必要的环境变量都已设置
3. 检查Vercel构建日志中是否有其他错误 