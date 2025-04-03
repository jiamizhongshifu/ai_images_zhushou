'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function EnvTest() {
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [apiEnvVars, setApiEnvVars] = useState<Record<string, string>>({});
  const [supabaseTest, setSupabaseTest] = useState<string>('测试中...');
  const [networkTest, setNetworkTest] = useState<string>('未测试');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 读取环境变量
    const vars: Record<string, string> = {};
    
    // 收集所有NEXT_PUBLIC开头的环境变量
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('NEXT_PUBLIC_')) {
        // 对于敏感信息如密钥，只显示部分内容
        if (key.includes('KEY') || key.includes('SECRET')) {
          const value = process.env[key] || '';
          vars[key] = value.substring(0, 10) + '...[已隐藏]';
        } else {
          vars[key] = process.env[key] || '';
        }
      }
    });
    
    setEnvVars(vars);
    
    // 从API获取环境变量
    const fetchEnvVarsFromApi = async () => {
      try {
        const response = await fetch('/api/env');
        if (response.ok) {
          const data = await response.json();
          
          // 处理敏感信息
          const processedData: Record<string, string> = {};
          Object.entries(data).forEach(([key, value]) => {
            if (typeof value === 'string') {
              if (key.includes('KEY') || key.includes('SECRET')) {
                processedData[key] = value.substring(0, 10) + '...[已隐藏]';
              } else {
                processedData[key] = value;
              }
            }
          });
          
          setApiEnvVars(processedData);
        }
      } catch (error) {
        console.error("获取API环境变量失败:", error);
      }
    };
    
    fetchEnvVarsFromApi();
    
    // 测试是否能创建Supabase客户端
    const testSupabaseClient = async () => {
      try {
        const supabase = await createClient();
        setSupabaseTest('客户端创建成功');
      } catch (error: any) {
        setSupabaseTest(`创建失败: ${error.message || '未知错误'}`);
      }
    };
    
    testSupabaseClient();
  }, []);
  
  // 测试网络连接
  const testNetwork = async () => {
    setLoading(true);
    setNetworkTest('测试中...');
    
    try {
      const startTime = performance.now();
      const response = await fetch('https://wcjctczyzibrswwngmvd.supabase.co/auth/v1/health');
      const endTime = performance.now();
      
      if (response.ok) {
        const data = await response.json();
        setNetworkTest(`连接成功! 响应时间: ${Math.round(endTime - startTime)}ms, 状态: ${data.status || 'OK'}`);
      } else {
        setNetworkTest(`连接失败! 状态码: ${response.status}`);
      }
    } catch (error: any) {
      setNetworkTest(`连接错误: ${error.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };
  
  // 测试Supabase会话
  const testSession = async () => {
    setLoading(true);
    
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        alert(`获取会话失败: ${error.message}`);
      } else if (data.session) {
        alert(`当前有活跃会话! 用户ID: ${data.session.user.id}`);
      } else {
        alert('当前无活跃会话');
      }
    } catch (error: any) {
      alert(`测试会话时出错: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 重新加载环境变量
  const reloadEnvVars = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/env');
      if (response.ok) {
        const data = await response.json();
        
        // 处理敏感信息
        const processedData: Record<string, string> = {};
        Object.entries(data).forEach(([key, value]) => {
          if (typeof value === 'string') {
            if (key.includes('KEY') || key.includes('SECRET')) {
              processedData[key] = value.substring(0, 10) + '...[已隐藏]';
            } else {
              processedData[key] = value;
            }
          }
        });
        
        setApiEnvVars(processedData);
        alert('环境变量已重新加载');
      } else {
        alert(`获取环境变量失败: ${response.status}`);
      }
    } catch (error: any) {
      alert(`重新加载出错: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">环境变量测试页面</h1>
      
      <div className="mb-8 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">客户端环境变量 (process.env)</h2>
        {Object.keys(envVars).length > 0 ? (
          <ul className="space-y-2">
            {Object.entries(envVars).map(([key, value]) => (
              <li key={key} className="border-b pb-2">
                <span className="font-medium">{key}:</span>{' '}
                <span className="font-mono">{value || '未设置'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-red-500">未找到环境变量</p>
        )}
      </div>
      
      <div className="mb-8 p-4 bg-indigo-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">API加载的环境变量</h2>
        {Object.keys(apiEnvVars).length > 0 ? (
          <ul className="space-y-2">
            {Object.entries(apiEnvVars).map(([key, value]) => (
              <li key={key} className="border-b pb-2">
                <span className="font-medium">{key}:</span>{' '}
                <span className="font-mono">{value || '未设置'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-amber-500">API环境变量未加载</p>
        )}
        <button 
          onClick={reloadEnvVars}
          disabled={loading}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          重新加载API环境变量
        </button>
      </div>
      
      <div className="mb-8 p-4 bg-green-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Supabase 客户端测试</h2>
        <p className={`mb-4 ${supabaseTest.includes('失败') ? 'text-red-500' : 'text-green-600'}`}>
          {supabaseTest}
        </p>
        
        <div className="flex space-x-4">
          <button 
            onClick={testSession}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            测试会话状态
          </button>
          
          <button 
            onClick={testNetwork}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            测试网络连接
          </button>
        </div>
        
        {networkTest !== '未测试' && (
          <div className={`mt-4 p-3 rounded ${networkTest.includes('成功') ? 'bg-green-100' : 'bg-red-100'}`}>
            {networkTest}
          </div>
        )}
      </div>
      
      <div className="mb-8 p-4 bg-yellow-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">故障排查指南</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>如果直接环境变量为空，但API环境变量有值，表明Next.js客户端环境变量注入有问题</li>
          <li>如果两种环境变量都为空，请检查<code className="bg-gray-100 px-1">.env</code>文件是否正确配置</li>
          <li>如果客户端创建失败，请检查Supabase URL和匿名密钥是否正确</li>
          <li>如果网络连接失败，可能是网络问题或防火墙阻止了请求</li>
          <li>尝试重启开发服务器，确保环境变量被正确加载</li>
          <li>清除浏览器缓存，特别是应用相关的Cookie和本地存储</li>
        </ul>
      </div>
      
      <div className="text-center">
        <a href="/auth/sign-in" className="text-indigo-600 hover:underline">返回登录页面</a>
      </div>
    </div>
  );
} 