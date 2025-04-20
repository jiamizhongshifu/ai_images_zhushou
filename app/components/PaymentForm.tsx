'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { PaymentType } from '@/utils/payment';

interface PaymentFormProps {
  url: string;
  formData: Record<string, string>;
}

/**
 * 支付表单组件，使用表单POST方式提交支付请求
 * 避免URL参数中的特殊字符问题
 */
export function PaymentForm({ url, formData }: PaymentFormProps) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  // 自动提交表单
  const handleSubmit = () => {
    startTransition(() => {
      // 立即设置为已提交，防止重复点击
      setSubmitted(true);
      
      // 创建并提交表单
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = url;
      form.target = '_self'; // 在当前窗口打开

      // 添加所有表单字段
      Object.entries(formData).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      // 添加表单到文档并提交
      document.body.appendChild(form);
      form.submit();
    });
  };

  // 构建支付方式文本
  const paymentMethodText = formData.type === PaymentType.ALIPAY ? '支付宝' : '微信支付';

  return (
    <Card className="p-4 text-center">
      {!submitted ? (
        <div className="space-y-4">
          <div className="text-lg font-medium">确认支付信息</div>
          <div className="flex flex-col items-center space-y-2">
            <p>支付方式: {paymentMethodText}</p>
            <p>商品: {formData.name}</p>
            <p>金额: {formData.money} 元</p>
            <p>订单号: {formData.out_trade_no}</p>
          </div>
          <Button 
            onClick={handleSubmit} 
            disabled={isPending} 
            className="w-full"
          >
            {isPending ? <Spinner size="sm" className="mr-2" /> : null}
            {isPending ? '正在准备跳转...' : '确认支付'}
          </Button>
          <p className="text-xs text-gray-500 mt-2">
            点击后将跳转至支付网关完成支付
          </p>
        </div>
      ) : (
        <div className="py-6 flex flex-col items-center justify-center space-y-4">
          <Spinner size="lg" />
          <p>正在跳转至支付网关，请稍候...</p>
        </div>
      )}
    </Card>
  );
} 