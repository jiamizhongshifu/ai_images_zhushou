'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase客户端配置
const SUPABASE_URL = 'https://wcjctczyzibrswwngmvd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjamN0Y3p5emlicnN3d25nbXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0MjAyMDcsImV4cCI6MjA1ODk5NjIwN30.vgCpbBqyHWV6ONAMDwOQ5kF6wn75p2txsYbMfLRJGAk';

// 创建Supabase客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function SessionBridge() {
  const [status, setStatus] = useState<'检查中' | '已认证' | '未认证'>('检查中');
  const [message, setMessage] = useState('正在验证会话状态...');
  const [countdown, setCountdown] = useState(5);
  const [logs, setLogs] = useState<string[]>([]);

  // 添加日志函数
  const addLog = (msg: string) => {
    console.log(`[会话桥接] ${msg}`);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    let redirectTimer: NodeJS.Timeout;
    let countdownTimer: NodeJS.Timeout;

    const verifySession = async () => {
      addLog('开始验证会话...');
      
      try {
        // 获取当前会话
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          addLog(`会话验证错误: ${error.message}`);
          setStatus('未认证');
          setMessage('会话验证失败，即将返回登录页面...');
          
          // 倒计时后重定向到登录页
          redirectTimer = setTimeout(() => {
            window.location.href = '/sign-in';
          }, 5000);
          
          return;
        }
        
        if (data.session) {
          addLog(`会话验证成功，用户ID: ${data.session.user.id}`);
          // 设置会话标记，帮助防止循环
          sessionStorage.setItem('authenticated', 'true');
          sessionStorage.setItem('authTime', Date.now().toString());
          
          setStatus('已认证');
          setMessage('会话已验证，即将进入应用...');
          
          // 尝试直接转向受保护页面
          redirectTimer = setTimeout(() => {
            addLog('重定向到受保护页面');
            window.location.href = '/protected';
          }, 2000);
        } else {
          addLog('没有找到活跃会话');
          setStatus('未认证');
          setMessage('未找到活跃会话，即将返回登录页面...');
          
          // 倒计时后重定向到登录页
          redirectTimer = setTimeout(() => {
            window.location.href = '/sign-in';
          }, 5000);
        }
      } catch (err) {
        addLog(`验证过程出错: ${err instanceof Error ? err.message : String(err)}`);
        setStatus('未认证');
        setMessage('会话验证过程中发生错误，即将返回登录页面...');
        
        // 倒计时后重定向到登录页
        redirectTimer = setTimeout(() => {
          window.location.href = '/sign-in';
        }, 5000);
      }
    };
    
    // 启动倒计时
    countdownTimer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownTimer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // 执行会话验证
    verifySession();
    
    // 清理定时器
    return () => {
      clearTimeout(redirectTimer);
      clearInterval(countdownTimer);
    };
  }, []);
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 p-8 bg-white rounded-xl shadow-md">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">会话验证</h2>
          <div className="mt-4">
            {status === '检查中' && (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
              </div>
            )}
            
            {status === '已认证' && (
              <div className="text-green-600 flex justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            
            {status === '未认证' && (
              <div className="text-red-600 flex justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>
          
          <p className="mt-4 text-gray-600">{message}</p>
          
          {status !== '检查中' && (
            <p className="mt-2 text-sm text-gray-500">
              {countdown}秒后自动跳转...
            </p>
          )}
        </div>
        
        {/* 显示日志信息 */}
        <div className="mt-6 border-t pt-4">
          <p className="text-sm font-medium text-gray-700">会话检查日志:</p>
          <div className="mt-2 bg-gray-50 p-3 rounded text-xs text-gray-600 max-h-32 overflow-auto">
            {logs.map((log, index) => (
              <div key={index} className="mb-1">{log}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 