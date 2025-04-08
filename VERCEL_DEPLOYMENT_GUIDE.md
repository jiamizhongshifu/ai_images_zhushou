# Vercel部署指南

## 问题修复

我们修复了以下问题：

1. 添加了`"use client"`指令到`components/ui/use-toast.tsx`和`components/ui/enhanced-toast.tsx`文件，以解决React hooks在非客户端组件中使用的问题。
2. 添加了`.env.example`文件作为环境变量配置模板。
3. 修复了类型错误：在`ToastProps`接口中添加了`variant`和`className`属性，解决了`enhanced-toast.tsx`中使用这些属性的类型错误问题。
4. 为`enhanced-toast.tsx`中的所有toast调用添加了必需的`type`属性，解决了类型兼容性问题。
5. 创建了`.env.production`文件，确保Vercel部署时能正确获取环境变量。

## 部署步骤

### 1. 使用Git Bundle部署

由于网络问题无法直接推送到GitHub，我们创建了Git bundle文件，您可以按照以下步骤使用：

```bash
# 在新目录中解包bundle
mkdir temp_deploy
cd temp_deploy
git clone deploy_ready_v4.bundle .

# 或者直接在本地仓库中应用更改
git bundle verify deploy_ready_v4.bundle
git fetch deploy_ready_v4.bundle main:fix-toast-branch
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
3. 检查类型兼容性问题，尤其是在组件之间传递属性时
4. 处理Sharp库的警告可能需要在Vercel项目设置中配置相应的构建命令
5. 创建一个有效的`.env`文件，确保必要的环境变量在构建过程中可用 