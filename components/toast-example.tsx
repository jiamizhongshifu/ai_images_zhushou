"use client"

import { Button } from "@/components/ui/button";
import { useUnifiedToast } from "@/components/ui/unified-toast";
import { useToast } from "@/components/ui/use-toast";
import { useEnhancedToast } from "@/components/ui/enhanced-toast";

export function ToastExample() {
  // 使用增强版Toast
  const enhancedToast = useEnhancedToast();
  
  // 使用基础版Toast作为备用
  const { toast, success, error, warning, info } = useToast();
  
  const showSuccessToast = () => {
    enhancedToast.success("操作成功", "您的操作已成功完成");
  };
  
  const showErrorToast = () => {
    enhancedToast.error("操作失败", "处理您的请求时出现错误");
  };
  
  const showWarningToast = () => {
    enhancedToast.warning("注意", "请注意这个操作可能有风险");
  };
  
  const showInfoToast = () => {
    enhancedToast.info("提示信息", "这是一条信息提示");
  };
  
  // 使用基础版Toast示例
  const showBasicToast = () => {
    success({
      title: "基础版提示",
      description: "这是使用基础版Toast显示的消息"
    });
  };
  
  // 使用支付ID的示例
  const showPaymentToast = () => {
    const ZPAY_PID = process.env.NEXT_PUBLIC_ZPAY_PID || "2025040215385823";
    
    enhancedToast.success("支付成功", `订单ID: ${ZPAY_PID}`);
  };
  
  return (
    <div className="flex flex-col space-y-4">
      <h3 className="text-lg font-medium">Toast通知演示</h3>
      <div className="flex flex-wrap gap-3">
        <Button onClick={showSuccessToast}>成功提示</Button>
        <Button onClick={showErrorToast} variant="destructive">错误提示</Button>
        <Button onClick={showWarningToast} variant="outline">警告提示</Button>
        <Button onClick={showInfoToast} variant="secondary">信息提示</Button>
        <Button onClick={showBasicToast} variant="ghost">基础提示</Button>
        <Button onClick={showPaymentToast} variant="default">支付提示</Button>
      </div>
    </div>
  );
} 