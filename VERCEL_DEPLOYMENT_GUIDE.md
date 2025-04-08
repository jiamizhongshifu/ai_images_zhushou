# Vercel部署指南

## 问题修复

我们修复了以下问题：

1. 添加了`"use client"`指令到`components/ui/use-toast.tsx`和`components/ui/enhanced-toast.tsx`文件，以解决React hooks在非客户端组件中使用的问题。
2. 添加了`.env.example`文件作为环境变量配置模板。
3. 修复了类型错误：在`ToastProps`接口中添加了`variant`和`className`属性，解决了`enhanced-toast.tsx`中使用这些属性的类型错误问题。
4. 为`enhanced-toast.tsx`中的所有toast调用添加了必需的`type`属性，解决了类型兼容性问题。
5. 创建了`.env.production`文件，确保Vercel部署时能正确获取环境变量。
6. 修复了`toast.dismiss`不存在的类型错误，正确从`useToast()`中解构获取`dismiss`函数。
7. 在`components/ui/input.tsx`中导出`InputProps`类型，解决了`form-elements.tsx`引用不存在类型的错误。
8. 彻底修复了`form-elements.tsx`中的类型错误，通过添加明确的字符串类型转换，确保`EnhancedTextarea`组件中的值始终以字符串形式处理：
   ```typescript
   const stringValue: string = typeof innerValue === 'string' ? innerValue : String(innerValue || '');
   const charCount = stringValue.length; // 不再有类型错误
   ```
9. 安装了缺失的依赖`@radix-ui/react-tooltip`，解决了`tooltip.tsx`组件的导入错误。
10. 更新了`pnpm-lock.yaml`文件，确保与`package.json`中的依赖保持同步，解决了Vercel部署时的"frozen-lockfile"错误。
11. 添加了缺失的`credits`属性到`components/user-credit-display.tsx`中的`CreditRechargeDialog`组件：
    ```tsx
    <CreditRechargeDialog
      isOpen={showCreditRechargeDialog}
      onClose={() => setShowCreditRechargeDialog(false)}
      onSuccess={handleRechargeSuccess}
      credits={creditState.credits || 0}  // 添加了缺失的credits属性
    />
    ```

## 部署步骤

### 1. 安装必要依赖

确保项目已安装所有必要的依赖，特别是最近添加的`@radix-ui/react-tooltip`：

```bash
# 使用pnpm安装
pnpm add @radix-ui/react-tooltip

# 或使用npm
npm install @radix-ui/react-tooltip

# 或使用yarn
yarn add @radix-ui/react-tooltip
```

### 2. 更新锁文件

每次添加或更新依赖后，确保更新锁文件并将它包含在提交中：

```bash
# 使用pnpm更新锁文件
pnpm install --no-frozen-lockfile

# 添加到Git
git add pnpm-lock.yaml
git commit -m "更新锁文件"
```

### 3. 推送代码到GitHub

将所有修改推送到GitHub仓库，Vercel会自动检测到更改并开始新的部署。

### 4. 验证依赖安装

在Vercel部署日志中确认`@radix-ui/react-tooltip`已被正确安装。

## 验证部署

部署完成后，访问以下URL确认Toast通知系统工作正常：

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
6. 确认`package.json`中包含了所有必要的依赖，特别是UI组件库的依赖 
7. 确保`pnpm-lock.yaml`文件与`package.json`保持同步，避免"frozen-lockfile"错误 
8. 查看props传递是否完整，特别是组件接口中定义为必需的属性 