import { ToastExample } from "@/components/toast-example";

export default function ToastDemoPage() {
  return (
    <div className="max-w-7xl w-full mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Toast通知系统演示</h1>
      <p className="text-gray-500 mb-8">
        本页面展示了增强版和基础版Toast通知系统的使用。点击下方按钮查看不同类型的通知效果。
      </p>
      
      <div className="border rounded-lg p-6 bg-card shadow-sm">
        <ToastExample />
      </div>
      
      <div className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">系统说明</h2>
        <div className="space-y-2">
          <p>1. 通过<code className="bg-muted px-1 py-0.5 rounded">useEnhancedToast</code>使用增强版Toast</p>
          <p>2. 通过<code className="bg-muted px-1 py-0.5 rounded">useToast</code>使用基础版Toast</p>
          <p>3. 通过<code className="bg-muted px-1 py-0.5 rounded">useUnifiedToast</code>统一使用两种Toast</p>
        </div>
        
        <p className="text-sm text-muted-foreground mt-8">
          支付演示使用环境变量：ZPAY_PID={process.env.NEXT_PUBLIC_ZPAY_PID || "2025040215385823"}
        </p>
      </div>
    </div>
  );
} 