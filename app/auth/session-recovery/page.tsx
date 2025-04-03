'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase客户端配置
const SUPABASE_URL = 'https://wcjctczyzibrswwngmvd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjamN0Y3p5emlicnN3d25nbXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0MjAyMDcsImV4cCI6MjA1ODk5NjIwN30.vgCpbBqyHWV6ONAMDwOQ5kF6wn75p2txsYbMfLRJGAk';

// 创建Supabase客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function SessionRecovery() {
  const [status, setStatus] = useState<'检查中' | '已恢复' | '恢复失败'>('检查中');
  const [message, setMessage] = useState('正在恢复会话状态...');
  const [countdown, setCountdown] = useState(3);
  const [logs, setLogs] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // 添加日志函数
  const addLog = (msg: string) => {
    console.log(`[会话恢复] ${msg}`);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    let redirectTimer: NodeJS.Timeout;
    let countdownTimer: NodeJS.Timeout;

    const recoverSession = async () => {
      addLog('开始恢复会话...');
      
      try {
        // 获取URL参数
        const urlParams = new URLSearchParams(window.location.search);
        const source = urlParams.get('source') || '未知';
        const redirectTarget = urlParams.get('redirect') || '/protected';
        
        addLog(`来源: ${source}, 目标: ${redirectTarget}`);
        
        // 检查是否可能处于重定向循环中
        const redirectAttempts = parseInt(sessionStorage.getItem('redirect_attempts') || '0');
        if (redirectAttempts > 3) {
          addLog('检测到可能的重定向循环，记录循环标记');
          document.cookie = 'redirect_loop_detected=true; path=/; max-age=300';
          setStatus('恢复失败');
          setMessage('检测到重定向循环，请尝试手动登录...');
          
          // 设置重定向到登录页
          redirectTimer = setTimeout(() => {
            window.location.href = '/sign-in?recovery_failed=true&loop_detected=true';
          }, 3000);
          
          return;
        }
        
        // 递增重定向尝试计数
        sessionStorage.setItem('redirect_attempts', (redirectAttempts + 1).toString());

        // 检查是否存在会话令牌
        const accessToken = localStorage.getItem('sb-access-token') || 
                           document.cookie.match(/sb-access-token=([^;]+)/)?.[1];
                           
        const refreshToken = localStorage.getItem('sb-refresh-token') || 
                            document.cookie.match(/sb-refresh-token=([^;]+)/)?.[1];
        
        if (!accessToken && !refreshToken) {
          addLog('未找到会话令牌，无法恢复会话');
          setStatus('恢复失败');
          setMessage('未找到会话令牌，即将返回登录页...');
          
          // 设置重定向到登录页
          redirectTimer = setTimeout(() => {
            window.location.href = '/sign-in?recovery_failed=true';
          }, 3000);
          
          return;
        }
        
        addLog('找到会话令牌，正在恢复会话...');
        
        // 重新创建会话
        if (refreshToken) {
          const { data, error } = await supabase.auth.refreshSession({
            refresh_token: refreshToken
          });
          
          if (error) {
            throw error;
          }
          
          if (data.session) {
            addLog(`会话恢复成功，用户ID: ${data.session.user.id}`);
            setUserId(data.session.user.id);
            
            // 设置会话恢复标记
            document.cookie = 'sb-session-recovery=true; path=/; max-age=60';
            localStorage.setItem('wasAuthenticated', 'true');
            sessionStorage.setItem('wasAuthenticated', 'true');
            
            // 清除重定向循环相关标记
            document.cookie = 'redirect_loop_detected=false; path=/; max-age=0';
            sessionStorage.removeItem('redirect_loop_detected');
            
            // 重置重定向尝试计数，但保留成功恢复标记
            sessionStorage.setItem('redirect_attempts', '0');
            sessionStorage.setItem('session_recovered', 'true');
            
            setStatus('已恢复');
            setMessage('会话已恢复，即将进入应用...');
            
            // 设置成功重定向
            redirectTimer = setTimeout(() => {
              // 添加时间戳和会话恢复标记，避免缓存和重定向循环
              const timestamp = Date.now();
              window.location.href = `${redirectTarget}?from=session_recovery&t=${timestamp}&recovered=true`;
            }, 3000);
          } else {
            throw new Error('会话恢复失败，未能获取有效会话');
          }
        }
      } catch (err) {
        addLog(`会话恢复出错: ${err instanceof Error ? err.message : String(err)}`);
        setStatus('恢复失败');
        setMessage('会话恢复失败，即将返回登录页...');
        
        // 设置重定向到登录页
        redirectTimer = setTimeout(() => {
          window.location.href = '/sign-in?recovery_failed=true';
        }, 3000);
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
    
    // 执行会话恢复
    recoverSession();
    
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
          <h2 className="text-2xl font-bold text-gray-900">会话恢复</h2>
          <div className="mt-4">
            {status === '检查中' && (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
              </div>
            )}
            
            {status === '已恢复' && (
              <div className="text-green-600 flex justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            
            {status === '恢复失败' && (
              <div className="text-red-600 flex justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>
          
          <p className="mt-4 text-gray-600">{message}</p>
          
          {userId && (
            <p className="mt-2 text-sm text-gray-500">
              用户ID: {userId.substring(0, 8)}...
            </p>
          )}
          
          <p className="mt-2 text-sm text-gray-500">
            {countdown}秒后自动跳转...
          </p>
        </div>
        
        {/* 显示日志信息 */}
        <div className="mt-6 border-t pt-4">
          <p className="text-sm font-medium text-gray-700">会话恢复日志:</p>
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