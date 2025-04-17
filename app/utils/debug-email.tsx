'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, XCircle, MailCheck } from 'lucide-react';

export function EmailDebugger() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [details, setDetails] = useState<Record<string, any>>({});
  
  const supabase = createClient();
  
  const testSignUp = async () => {
    if (!email) {
      setStatus('error');
      setMessage('请输入邮箱地址');
      return;
    }
    
    try {
      setStatus('loading');
      setMessage('正在测试注册邮件发送...');
      
      // 创建一个临时随机密码
      const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password: tempPassword,
        options: {
          emailRedirectTo: window.location.origin + '/auth/callback',
          data: {
            debug_test: true,
            test_time: new Date().toISOString(),
          }
        }
      });
      
      setDetails({
        requestTime: new Date().toISOString(),
        responseData: data || {},
        error: error || null,
      });
      
      if (error) {
        setStatus('error');
        if (error.message.includes('already registered')) {
          setMessage('此邮箱已注册，尝试发送重置密码邮件');
          // 尝试发送重置密码邮件
          await testResetPassword();
          return;
        } else {
          setMessage(`测试失败: ${error.message}`);
        }
      } else if (data?.user) {
        setStatus('success');
        setMessage('注册邮件已发送，请检查邮箱(包括垃圾邮件文件夹)');
      } else {
        setStatus('error');
        setMessage('未收到用户数据，但没有明确错误');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(`发生异常: ${err.message || '未知错误'}`);
      setDetails({
        error: err,
        time: new Date().toISOString(),
      });
    }
  };
  
  const testResetPassword = async () => {
    if (!email) {
      setStatus('error');
      setMessage('请输入邮箱地址');
      return;
    }
    
    try {
      setStatus('loading');
      setMessage('正在测试密码重置邮件发送...');
      
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth/callback?redirect_to=/protected/reset-password',
      });
      
      setDetails({
        requestTime: new Date().toISOString(),
        responseData: data || {},
        error: error || null,
      });
      
      if (error) {
        setStatus('error');
        setMessage(`测试失败: ${error.message}`);
      } else {
        setStatus('success');
        setMessage('密码重置邮件已发送，请检查邮箱(包括垃圾邮件文件夹)');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(`发生异常: ${err.message || '未知错误'}`);
      setDetails({
        error: err,
        time: new Date().toISOString(),
      });
    }
  };
  
  const resendVerification = async () => {
    if (!email) {
      setStatus('error');
      setMessage('请输入邮箱地址');
      return;
    }
    
    try {
      setStatus('loading');
      setMessage('正在重发验证邮件...');
      
      const { data, error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: window.location.origin + '/auth/callback',
        },
      });
      
      setDetails({
        requestTime: new Date().toISOString(),
        responseData: data || {},
        error: error || null,
      });
      
      if (error) {
        setStatus('error');
        setMessage(`重发失败: ${error.message}`);
      } else {
        setStatus('success');
        setMessage('验证邮件已重发，请检查邮箱(包括垃圾邮件文件夹)');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(`发生异常: ${err.message || '未知错误'}`);
      setDetails({
        error: err,
        time: new Date().toISOString(),
      });
    }
  };
  
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="h-5 w-5" />
          邮件功能诊断
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">电子邮箱</label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="输入测试邮箱地址"
              className="w-full"
            />
          </div>
          
          <div className="flex gap-2">
            <Button onClick={testSignUp} disabled={status === 'loading'}>
              测试注册邮件
            </Button>
            <Button onClick={testResetPassword} disabled={status === 'loading'}>
              测试重置邮件
            </Button>
            <Button onClick={resendVerification} disabled={status === 'loading'}>
              重发验证邮件
            </Button>
          </div>
          
          {status !== 'idle' && (
            <Alert variant={status === 'success' ? 'default' : 'destructive'}>
              <div className="flex items-center gap-2">
                {status === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                <AlertTitle>{status === 'success' ? '成功' : status === 'loading' ? '处理中' : '错误'}</AlertTitle>
              </div>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          
          <div className="mt-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs"
            >
              {showDetails ? '隐藏详情' : '显示详情'}
            </Button>
            
            {showDetails && Object.keys(details).length > 0 && (
              <pre className="mt-2 p-2 bg-muted rounded-md text-xs overflow-auto max-h-32">
                {JSON.stringify(details, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 