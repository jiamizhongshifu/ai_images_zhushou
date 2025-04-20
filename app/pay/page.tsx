"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * 支付完成跳转中转页面
 * 
 * 此页面用于接收简化的支付返回通知，然后转发到真正的目标页面
 */
export default function PaymentRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<string>("跳转中...");
  
  useEffect(() => {
    // 确保searchParams存在
    if (!searchParams) {
      setStatus("缺少参数，3秒后返回首页...");
      setTimeout(() => {
        router.push("/");
      }, 3000);
      return;
    }
    
    const handleRedirect = async () => {
      try {
        // 获取订单号
        const orderNo = searchParams.get("o");
        
        if (!orderNo) {
          setStatus("缺少订单参数，3秒后返回首页...");
          setTimeout(() => {
            router.push("/");
          }, 3000);
          return;
        }
        
        // 检查支付状态
        try {
          const response = await fetch(`/api/payment/check?order_no=${orderNo}&_t=${Date.now()}`);
          const data = await response.json();
          
          if (data.success) {
            // 记录支付状态
            console.log("支付检查结果:", data);
            
            // 跳转到保护页
            setTimeout(() => {
              router.push(`/protected?order_no=${orderNo}`);
            }, 1000);
          } else {
            // 支付可能未完成，仍然跳转
            setTimeout(() => {
              router.push(`/protected?order_no=${orderNo}`);
            }, 1000);
          }
        } catch (error) {
          console.error("检查支付状态失败:", error);
          // 发生错误时也跳转到默认页面
          setTimeout(() => {
            router.push(`/protected?order_no=${orderNo}`);
          }, 1000);
        }
      } catch (error) {
        console.error("处理支付返回时发生错误:", error);
        setStatus("跳转出错，3秒后返回首页...");
        setTimeout(() => {
          router.push("/");
        }, 3000);
      }
    };
    
    handleRedirect();
  }, [router, searchParams]);
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-8 shadow-lg">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h1 className="text-xl font-bold mb-2">支付处理中</h1>
        <p className="text-center text-muted-foreground">{status}</p>
      </div>
    </div>
  );
} 