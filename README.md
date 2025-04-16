<a href="https://demo-nextjs-with-supabase.vercel.app/">
  <img alt="Next.js and Supabase Starter Kit - the fastest way to build apps with Next.js and Supabase" src="https://demo-nextjs-with-supabase.vercel.app/opengraph-image.png">
  <h1 align="center">Next.js and Supabase Starter Kit</h1>
</a>

<p align="center">
 The fastest way to build apps with Next.js and Supabase
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#demo"><strong>Demo</strong></a> ·
  <a href="#deploy-to-vercel"><strong>Deploy to Vercel</strong></a> ·
  <a href="#clone-and-run-locally"><strong>Clone and run locally</strong></a> ·
  <a href="#feedback-and-issues"><strong>Feedback and issues</strong></a>
  <a href="#more-supabase-examples"><strong>More Examples</strong></a>
</p>
<br/>

## Features

- Works across the entire [Next.js](https://nextjs.org) stack
  - App Router
  - Pages Router
  - Middleware
  - Client
  - Server
  - It just works!
- supabase-ssr. A package to configure Supabase Auth to use cookies
- Styling with [Tailwind CSS](https://tailwindcss.com)
- Components with [shadcn/ui](https://ui.shadcn.com/)
- Optional deployment with [Supabase Vercel Integration and Vercel deploy](#deploy-your-own)
  - Environment variables automatically assigned to Vercel project

## Demo

You can view a fully working demo at [demo-nextjs-with-supabase.vercel.app](https://demo-nextjs-with-supabase.vercel.app/).

## Deploy to Vercel

Vercel deployment will guide you through creating a Supabase account and project.

After installation of the Supabase integration, all relevant environment variables will be assigned to the project so the deployment is fully functioning.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-supabase&project-name=nextjs-with-supabase&repository-name=nextjs-with-supabase&demo-title=nextjs-with-supabase&demo-description=This+starter+configures+Supabase+Auth+to+use+cookies%2C+making+the+user%27s+session+available+throughout+the+entire+Next.js+app+-+Client+Components%2C+Server+Components%2C+Route+Handlers%2C+Server+Actions+and+Middleware.&demo-url=https%3A%2F%2Fdemo-nextjs-with-supabase.vercel.app%2F&external-id=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-supabase&demo-image=https%3A%2F%2Fdemo-nextjs-with-supabase.vercel.app%2Fopengraph-image.png)

The above will also clone the Starter kit to your GitHub, you can clone that locally and develop locally.

If you wish to just develop locally and not deploy to Vercel, [follow the steps below](#clone-and-run-locally).

## Clone and run locally

1. You'll first need a Supabase project which can be made [via the Supabase dashboard](https://database.new)

2. Create a Next.js app using the Supabase Starter template npx command

   ```bash
   npx create-next-app --example with-supabase with-supabase-app
   ```

   ```bash
   yarn create next-app --example with-supabase with-supabase-app
   ```

   ```bash
   pnpm create next-app --example with-supabase with-supabase-app
   ```

3. Use `cd` to change into the app's directory

   ```bash
   cd with-supabase-app
   ```

4. Rename `.env.example` to `.env.local` and update the following:

   ```
   NEXT_PUBLIC_SUPABASE_URL=[INSERT SUPABASE PROJECT URL]
   NEXT_PUBLIC_SUPABASE_ANON_KEY=[INSERT SUPABASE PROJECT API ANON KEY]
   ```

   Both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` can be found in [your Supabase project's API settings](https://app.supabase.com/project/_/settings/api)

5. You can now run the Next.js local development server:

   ```bash
   npm run dev
   ```

   The starter kit should now be running on [localhost:3000](http://localhost:3000/).

6. This template comes with the default shadcn/ui style initialized. If you instead want other ui.shadcn styles, delete `components.json` and [re-install shadcn/ui](https://ui.shadcn.com/docs/installation/next)

> Check out [the docs for Local Development](https://supabase.com/docs/guides/getting-started/local-development) to also run Supabase locally.

## Feedback and issues

Please file feedback and issues over on the [Supabase GitHub org](https://github.com/supabase/supabase/issues/new/choose).

## More Supabase examples

- [Next.js Subscription Payments Starter](https://github.com/vercel/nextjs-subscription-payments)
- [Cookie-based Auth and the Next.js 13 App Router (free course)](https://youtube.com/playlist?list=PL5S4mPUpp4OtMhpnp93EFSo42iQ40XjbF)
- [Supabase Auth and the Next.js App Router](https://github.com/supabase/supabase/tree/master/examples/auth/nextjs)

# AI 图像生成助手

基于Next.js和Supabase构建的AI图像生成服务，支持异步任务处理与状态追踪。

## 特性

- 异步图像生成与任务状态跟踪
- 实时任务进度更新
- 支持任务取消和点数退还
- 任务状态持久化，刷新页面后仍可查看任务进度

## 安装与设置

1. 安装依赖

```bash
npm install
```

2. 设置环境变量

创建`.env.local`文件，添加以下内容：

```
NEXT_PUBLIC_SUPABASE_URL=你的Supabase项目URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的Supabase匿名密钥
SUPABASE_SERVICE_ROLE_KEY=你的Supabase服务角色密钥（用于管理员操作）
```

3. 应用数据库函数

```bash
node scripts/apply-db-functions.js
```

4. 启动开发服务器

```bash
npm run dev
```

## 任务管理

系统使用`ai_images_creator_tasks`表存储所有图像生成任务。任务状态包括：

- `pending`: 等待处理
- `processing`: 正在处理
- `completed`: 已完成
- `failed`: 失败
- `cancelled`: 已取消

任务取消流程：
1. 前端调用`/api/generate-image/cancel`接口
2. 后端将任务状态更新为`cancelled`
3. 如果已扣除点数，系统自动退还

点数管理：
- 成功生成图片扣除点数
- 任务取消或失败退还点数
- 使用`increment_user_credits`数据库函数处理退款

## 故障排除

如果任务长时间处于`pending`状态：
- 检查任务处理服务是否正常运行
- 确认数据库连接正常
- 尝试取消任务并重新提交

如果无法取消任务：
- 检查浏览器控制台错误信息
- 确认API路由`/api/generate-image/cancel`可访问
- 验证数据库连接和权限设置

## 开发工具

### 测试任务取消

如果遇到任务无法取消的问题，可以使用测试脚本诊断问题：

```bash
# 设置环境变量（请替换为您的实际值）
export NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
export NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
# 或者使用服务角色密钥（更高权限）
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# 运行测试脚本（替换task_id为实际任务ID）
node scripts/test-cancel.js task_id
```

这个脚本会显示任务的当前状态，并提供两种方法测试取消操作：
1. 直接更新表状态
2. 使用RPC函数

根据测试结果，脚本会提供相应的解决方案建议。

### 启动任务处理器

系统使用异步任务队列处理图像生成请求。必须启动任务处理器才能实际执行图像生成：

```bash
# 在开发环境启动
node scripts/task-processor.mjs
```

任务处理器会自动：
1. 轮询数据库中的pending任务
2. 调用处理API执行图像生成
3. 更新任务状态和结果

在生产环境中，建议使用PM2等进程管理工具来运行任务处理器：

```bash
# 安装PM2
npm install -g pm2

# 使用PM2启动并保持运行
pm2 start scripts/task-processor.mjs --name "ai-image-task-processor"

# 查看日志
pm2 logs ai-image-task-processor
```

### 常见问题

#### 任务无法取消

可能的原因：
1. 缺少更新权限策略。在Supabase控制台SQL编辑器中执行：
   ```sql
   CREATE POLICY "Users can update their own tasks"
     ON ai_images_creator_tasks
     FOR UPDATE
     USING (auth.uid() = user_id);
   ```

2. 缺少RPC函数。在Supabase控制台SQL编辑器中执行`sql/ai_images_creator_tasks.sql`中的`cancel_task`函数定义。

#### 任务长时间处于pending状态

可能的原因：
1. 任务处理器未运行。请确保运行`node scripts/task-processor.mjs`脚本。
2. 处理API出错。检查任务处理器的日志输出。
3. 环境变量配置不正确。确保所有必需的API密钥都已设置。

## 系统配置

### 环境变量配置

本项目使用环境变量进行配置，请确保以下几点：

1. 复制 `.env.example` 文件并重命名为 `.env` 或 `.env.local`
2. 填写必要的环境变量，特别是以下关键变量：
   - `TASK_PROCESS_SECRET_KEY`: 任务处理服务之间的认证密钥，必须保持一致
   - `INTERNAL_API_KEY`: 内部API调用的认证密钥，与上面的密钥配合使用
   - `OPENAI_API_KEY`: OpenAI/图资API的访问密钥
   - Supabase相关配置

#### 重要说明：任务处理密钥配置

确保所有服务环境中的 `TASK_PROCESS_SECRET_KEY` 和 `INTERNAL_API_KEY` 保持一致，否则会导致：
- 任务进度更新失败（出现401未授权错误）
- 跨服务通信中断
- 任务状态无法正确同步

执行以下命令可以验证环境变量配置：

```bash
node scripts/check-env.mjs
```

### API访问认证

系统内部API通信使用以下认证方式：
- Bearer Token: `Authorization: Bearer YOUR_SECRET_KEY`
- API Key: `X-API-Key: YOUR_SECRET_KEY`

两种方式都支持，确保密钥在所有环境中保持一致。
