"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { FcGoogle } from "react-icons/fc";
import { FaGoogle } from "react-icons/fa";
import { Spinner } from "@/components/ui/spinner";
import { toast } from 'sonner';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/app/lib/mock-storage';
import { useUserStateContext } from './providers/user-state-provider';

// 用于检测是否处于受限环境（如浏览器扩展或iframe）
export function isRestrictedEnvironment() {
  // 确保仅在客户端环境中执行
  if (typeof window === 'undefined') {
    return false; // 服务器端渲染时返回false
  }
  
  try {
    // 检查是否在iframe中
    const isInIframe = window !== window.top;
    
    // 检查是否为扩展环境
    const isExtensionEnv = window.location.protocol === 'chrome-extension:' || 
                         window.location.protocol === 'moz-extension:' ||
                         /extension|addon/i.test(navigator.userAgent);
    
    // 检查存储访问是否受限
    let storageAccessible = false;
    try {
      window.localStorage.setItem('_test_storage_', '1');
      window.localStorage.removeItem('_test_storage_');
      storageAccessible = true;
    } catch (e) {
      console.error('存储访问受限:', e);
    }
    
    return isInIframe || isExtensionEnv || !storageAccessible;
  } catch (e) {
    console.error('环境检测错误:', e);
    return true; // 如果发生任何错误，假设在受限环境中
  }
}

// 安全地存储状态
export function safeStoreState(stateData: any) {
  try {
    const stateKey = `google_auth_${Date.now()}`;
    // 使用安全存储方法
    safeSetItem(stateKey, JSON.stringify(stateData));
    return stateKey;
  } catch (e) {
    console.error('存储状态出错:', e);
    return null;
  }
}

// 安全地获取状态
export function safeGetState(stateKey: string) {
  try {
    const stateStr = safeGetItem(stateKey);
    if (!stateStr) return null;
    return JSON.parse(stateStr);
  } catch (e) {
    console.error('获取状态出错:', e);
    return null;
  }
}

// 清除状态
export function safeClearState(stateKey: string) {
  try {
    safeRemoveItem(stateKey);
  } catch (e) {
    console.error('清除状态出错:', e);
  }
}

interface SafeGoogleLoginProps {
  callbackUrl?: string;
  className?: string;
  onSuccess?: (userData: any) => void;
  onError?: (error: string) => void;
  buttonText?: string;
  isLoading?: boolean;
  disabled?: boolean;
}

export default function SafeGoogleLogin({
  callbackUrl = '/dashboard',
  className = '',
  onSuccess,
  onError,
  buttonText = '使用Google登录',
  isLoading = false,
  disabled = false
}: SafeGoogleLoginProps) {
  const [loading, setLoading] = useState(isLoading);
  const [popupLoading, setPopupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRestrictedEnv, setIsRestrictedEnv] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>({});
  
  const popupRef = useRef<Window | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stateKeyRef = useRef<string | null>(null);
  const { refreshUserState } = useUserStateContext();
  const isRestricted = isRestrictedEnvironment();
  
  // 检查登录状态
  const checkLoginStatus = useCallback(async (timestamp: number, sessionKey: string) => {
    try {
      const response = await fetch('/api/auth/google/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ timestamp, sessionKey }),
      });
      
      if (!response.ok) {
        console.warn('检查登录状态失败:', response.status);
        // 非致命错误，继续检查
        return null;
      }
      
      const data = await response.json();
      
      // 将状态信息添加到调试数据
      setDebugInfo(prev => ({ ...prev, statusResponse: data }));
      
      return data;
    } catch (e) {
      console.error('检查登录状态出错:', e);
      return null;
    }
  }, []);
  
  // 清除登出标记
  const clearLogoutFlags = useCallback(() => {
    try {
      console.log('清除登出标记...');
      // 1. 清除登出标记
      localStorage.removeItem('force_logged_out');
      sessionStorage.removeItem('isLoggedOut');
      
      // 2. 设置认证标记
      const loginTime = Date.now();
      localStorage.setItem('auth_valid', 'true');
      localStorage.setItem('auth_time', loginTime.toString());
      localStorage.setItem('wasAuthenticated', 'true');
      sessionStorage.setItem('activeAuth', 'true');
      
      // 3. 设置cookie
      const cookieOptions = '; path=/; max-age=86400; SameSite=Lax';
      document.cookie = `user_authenticated=true${cookieOptions}`;
      document.cookie = `auth_time=${loginTime}${cookieOptions}`;
      
      // 4. 清除登出相关cookie
      const expireOptions = '; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = `logged_out=${expireOptions}`;
      document.cookie = `force_logged_out=${expireOptions}`;
      document.cookie = `isLoggedOut=${expireOptions}`;
      
      console.log('登出标记已清除');
      return true;
    } catch (e) {
      console.error('清除登出标记失败:', e);
      return false;
    }
  }, []);
  
  // 处理Google登录
  const handleGoogleLogin = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('[GoogleLogin] 开始登录流程');
      // 清理之前的资源
      clearLogoutFlags();
      
      // 检测是否在受限环境
      const restrictedEnv = isRestrictedEnvironment();
      setIsRestrictedEnv(restrictedEnv);
      setDebugInfo({ restrictedEnv });
      console.log('[GoogleLogin] 环境检测:', restrictedEnv ? '受限环境' : '正常环境');
      
      // 初始化登录流程
      const timestamp = Date.now();
      const sessionKey = Math.random().toString(36).substring(2);
      stateKeyRef.current = safeStoreState({ timestamp, sessionKey });
      
      if (!stateKeyRef.current) {
        throw new Error('无法安全存储状态');
      }
      
      // 保存重定向URL到本地存储
      try {
        const redirectTarget = callbackUrl || '/protected';
        console.log('[GoogleLogin] 保存重定向目标:', redirectTarget);
        localStorage.setItem('redirect_after_login', redirectTarget);
        
        // 额外保存重定向URL到会话相关的存储中
        localStorage.setItem(
          'google_auth_redirect_' + sessionKey, 
          JSON.stringify({ url: redirectTarget, timestamp: Date.now() })
        );
      } catch (storeError) {
        console.error('[GoogleLogin] 无法保存重定向信息:', storeError);
      }
      
      // 请求授权URL
      setPopupLoading(true);
      console.log('[GoogleLogin] 请求授权URL:', {timestamp, sessionKey, isRestricted: restrictedEnv});
      
      const response = await fetch('/api/auth/google/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          timestamp, 
          sessionKey,
          fallbackUrl: window.location.pathname, // 当前页面路径作为fallback
          isRestricted: restrictedEnv
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GoogleLogin] 获取授权URL失败:', errorText);
        throw new Error(`获取授权URL失败: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[GoogleLogin] 收到授权响应:', data);
      
      const authUrl = data.url; // 从返回的url字段获取授权URL
      setDebugInfo(prev => ({ ...prev, authResponse: data }));
      
      if (!authUrl) {
        console.error('[GoogleLogin] 无效的授权URL:', data);
        throw new Error('无效的授权URL');
      }
      
      console.log('[GoogleLogin] 准备打开OAuth弹窗:', authUrl);
      
      // 打开OAuth弹窗
      const popupWidth = 500;
      const popupHeight = 600;
      const left = window.screenX + (window.outerWidth - popupWidth) / 2;
      const top = window.screenY + (window.outerHeight - popupHeight) / 2;
      
      popupRef.current = window.open(
        authUrl,
        'google-oauth',
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top}`
      );
      
      if (!popupRef.current) {
        throw new Error('弹窗被阻止，请允许弹窗');
      }
      
      // 监听来自弹窗的消息
      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'GOOGLE_AUTH_RESULT') {
          if (event.data.success) {
            // 认证成功，关闭定时器
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current);
              checkIntervalRef.current = null;
            }
            
            // 清除任何登出标记
            clearLogoutFlags();
            
            // 检查是否有重定向信息
            const redirectTo = event.data.redirectTo || '/create';
            console.log(`认证成功，将重定向到: ${redirectTo}`);
            
            // 检查最终状态
            checkLoginStatus(timestamp, sessionKey).then(statusData => {
              setPopupLoading(false);
              setLoading(false);
              
              if (statusData?.status === 'success' && statusData.userData) {
                // 清除任何登出标记
                clearLogoutFlags();
                
                if (onSuccess) onSuccess(statusData.userData);
                toast('登录成功!');
                
                // 延迟导航，给状态更新一些时间
                setTimeout(() => {
                  window.location.href = redirectTo;
                }, 1000);
              } else {
                // 即使状态检查不成功，如果消息中标记为成功，也尝试重定向
                const errMsg = statusData?.error || '登录成功但无法获取用户数据';
                console.warn(errMsg);
                // 仍然清除登出标记
                clearLogoutFlags();
                
                // 延迟导航到创作页
                setTimeout(() => {
                  window.location.href = redirectTo;
                }, 1000);
              }
            });
          } else {
            setPopupLoading(false);
            setLoading(false);
            const errMsg = event.data.message || '登录失败';
            setError(errMsg);
            if (onError) onError(errMsg);
            toast(errMsg);
          }
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      // 定期检查登录状态
      checkIntervalRef.current = setInterval(async () => {
        // 检查弹窗是否已关闭
        if (popupRef.current && popupRef.current.closed) {
          console.log('OAuth弹窗已关闭');
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current);
            checkIntervalRef.current = null;
          }
          
          // 最后一次检查状态
          const finalStatus = await checkLoginStatus(timestamp, sessionKey);
          setPopupLoading(false);
          setLoading(false);
          
          if (finalStatus?.status === 'success' && finalStatus.userData) {
            // 清除任何登出标记
            clearLogoutFlags();
            
            if (onSuccess) onSuccess(finalStatus.userData);
            toast('登录成功!');
          } else if (finalStatus?.status === 'failed') {
            const errMsg = finalStatus.error || '登录失败';
            setError(errMsg);
            if (onError) onError(errMsg);
            toast(errMsg);
          } else {
            const errMsg = '登录窗口已关闭，但未完成认证';
            setError(errMsg);
            if (onError) onError(errMsg);
            toast(errMsg);
          }
          
          window.removeEventListener('message', messageHandler);
        } else {
          // 定期检查登录状态
          const status = await checkLoginStatus(timestamp, sessionKey);
          
          if (status?.status === 'success' && status.userData) {
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current);
              checkIntervalRef.current = null;
            }
            
            setPopupLoading(false);
            setLoading(false);
            
            // 清除任何登出标记
            clearLogoutFlags();
            
            if (onSuccess) onSuccess(status.userData);
            toast('登录成功!');
            
            // 尝试关闭弹窗
            if (popupRef.current && !popupRef.current.closed) {
              popupRef.current.close();
            }
            
            window.removeEventListener('message', messageHandler);
          } else if (status?.status === 'failed') {
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current);
              checkIntervalRef.current = null;
            }
            
            setPopupLoading(false);
            setLoading(false);
            
            const errMsg = status.error || '登录失败';
            setError(errMsg);
            if (onError) onError(errMsg);
            toast(errMsg);
            
            // 尝试关闭弹窗
            if (popupRef.current && !popupRef.current.closed) {
              popupRef.current.close();
            }
            
            window.removeEventListener('message', messageHandler);
          }
        }
      }, 2000);
      
      // 设置超时处理
      setTimeout(() => {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
          
          if (!popupRef.current?.closed) {
            popupRef.current?.close();
          }
          
          setPopupLoading(false);
          setLoading(false);
          
          const errMsg = '登录超时，请重试';
          setError(errMsg);
          if (onError) onError(errMsg);
          toast(errMsg);
          
          window.removeEventListener('message', messageHandler);
        }
      }, 120000); // 2分钟超时
    } catch (e: any) {
      console.error('Google登录出错:', e);
      setPopupLoading(false);
      setLoading(false);
      const errMsg = e.message || '登录过程中发生错误';
      setError(errMsg);
      if (onError) onError(errMsg);
      toast(errMsg);
    }
  }, [checkLoginStatus, onSuccess, onError]);
  
  // 添加消息事件监听器，处理回调窗口传来的会话刷新消息
  useEffect(() => {
    // 监听来自回调窗口的消息
    const handleMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object') {
        console.log('[GoogleLogin] 收到消息:', event.data);
        
        // 处理认证结果消息
        if (event.data.type === 'GOOGLE_AUTH_RESULT') {
          if (event.data.success) {
            console.log('[GoogleLogin] 收到成功的认证结果');
            // 清除登出标记
            clearLogoutFlags();
            if (onSuccess) onSuccess(event.data);
          } else {
            console.error('[GoogleLogin] 收到失败的认证结果:', event.data.message);
            setError(event.data.message || '认证失败');
            if (onError) onError(event.data.message || '认证失败');
          }
          
          setLoading(false);
          setPopupLoading(false);
        }
        
        // 处理会话刷新消息 - 添加新的处理逻辑
        if (event.data.type === 'REFRESH_SUPABASE_SESSION') {
          console.log('[GoogleLogin] 收到会话刷新消息，开始刷新用户状态');
          
          // 确保清除所有登出标记
          clearLogoutFlags();
          
          // 添加延迟确保cookie已被设置
          setTimeout(async () => {
            try {
              // 1. 主动尝试刷新会话
              await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timestamp: event.data.timestamp })
              });
              
              // 2. 刷新用户状态 - 强制刷新，忽略缓存
              console.log('[GoogleLogin] 强制刷新用户状态');
              const success = await refreshUserState(false, true);
              
              console.log('[GoogleLogin] 用户状态刷新结果:', success);
              
              if (success) {
                // 确保UI更新
                setLoading(false);
                setPopupLoading(false);
                
                // 通知成功回调
                if (onSuccess) onSuccess({ status: 'success', refreshed: true });
              } else {
                console.warn('[GoogleLogin] 用户状态刷新失败，稍后将自动重试');
                // 稍后再试一次
                setTimeout(() => {
                  refreshUserState(true, true);
                }, 2000);
              }
            } catch (error) {
              console.error('[GoogleLogin] 刷新会话出错:', error);
            }
          }, 1000);
        }
      }
    };
    
    // 添加消息监听器
    window.addEventListener('message', handleMessage);
    
    // 清理函数
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onSuccess, onError, refreshUserState]);
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      
      if (stateKeyRef.current) {
        safeClearState(stateKeyRef.current);
      }
    };
  }, []);
  
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleLogin}
        disabled={disabled || loading}
        className={`flex items-center justify-center ${className}`}
      >
        {loading || popupLoading ? (
          <Spinner className="mr-2 h-4 w-4" />
        ) : (
          <FcGoogle className="mr-2 h-4 w-4" />
        )}
        {popupLoading ? '正在进行身份验证...' : buttonText}
      </Button>
      
      {error && (
        <p className="text-sm text-red-500 mt-2">
          {error} {isRestrictedEnv && '（检测到受限环境，可能影响登录）'}
        </p>
      )}
      
      {/* 仅在开发环境显示调试信息 */}
      {process.env.NODE_ENV === 'development' && Object.keys(debugInfo).length > 0 && (
        <details className="mt-2 text-xs border border-gray-200 p-2 rounded">
          <summary className="cursor-pointer">调试信息</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
} 