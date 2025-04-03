/**
 * API客户端工具
 * 提供统一的API请求方法，确保所有请求都包含认证信息
 */

// API响应类型定义
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  statusText?: string;
  unauthorized?: boolean;
  
  // 扩展特定API响应类型
  credits?: number;
  history?: any[];
  task?: {
    taskId: string;
    status: string;
    created_at: string;
    result_url?: string;
    error?: string;
  };
  tasks?: any[];
  taskId?: string;
  creditsRefunded?: boolean;
}

// 处理API响应
async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  // 检查是否401未授权
  if (response.status === 401) {
    console.warn('API请求未授权');
    return { 
      success: false, 
      error: '认证错误',
      status: 401,
      unauthorized: true
    };
  }

  // 尝试解析JSON响应
  try {
    const data = await response.json();
    return {
      success: response.ok,
      data: response.ok ? data : undefined,
      error: response.ok ? undefined : (data.error || '请求失败'),
      status: response.status,
      statusText: response.statusText
    };
  } catch (e) {
    console.error('解析API响应失败:', e);
    return { 
      success: false, 
      error: '无法解析服务器响应',
      status: response.status,
      statusText: response.statusText
    };
  }
}

// 获取认证头
function getAuthHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  try {
    // 检测临时授权标记
    const hasTemporaryAuth = 
      document.cookie.includes('manualAuth=true') || 
      document.cookie.includes('sb-session-recovery=true') ||
      localStorage.getItem('wasAuthenticated') === 'true' ||
      sessionStorage.getItem('wasAuthenticated') === 'true';
      
    // 如果有临时授权，添加临时授权头
    if (hasTemporaryAuth) {
      headers['x-temporary-auth'] = 'true';
      console.log('API请求添加临时授权标记');
    }
    
    // 尝试从localStorage获取token
    const tokenStr = localStorage.getItem('supabase.auth.token');
    if (tokenStr) {
      const token = JSON.parse(tokenStr);
      if (token && token.access_token) {
        headers['Authorization'] = `Bearer ${token.access_token}`;
        headers['x-auth-token'] = token.access_token;
      }
    }
    
    // 从localStorage获取刷新令牌
    const refreshToken = localStorage.getItem('sb-refresh-token');
    if (refreshToken) {
      headers['x-refresh-token'] = refreshToken;
    }
    
    // 从Cookie中获取会话令牌
    const cookieToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('sb-access-token='))
      ?.split('=')[1];
      
    if (cookieToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${cookieToken}`;
      headers['x-auth-token'] = cookieToken;
    }
    
  } catch (error) {
    console.warn('获取认证信息失败:', error);
  }
  
  return headers;
}

// GET请求方法
export async function apiGet<T>(url: string): Promise<ApiResponse<T>> {
  try {
    const headers = getAuthHeaders();
    console.log('API GET请求:', { url, headers });
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    return handleResponse<T>(response);
  } catch (error) {
    console.error('API GET请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

// POST请求方法
export async function apiPost<T>(url: string, body: any): Promise<ApiResponse<T>> {
  try {
    const headers = getAuthHeaders();
    console.log('API POST请求:', { url, headers });
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body)
    });

    return handleResponse<T>(response);
  } catch (error) {
    console.error('API POST请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

// 获取当前会话信息
export function getAuthHeader() {
  try {
    const tokenStr = localStorage.getItem('supabase.auth.token');
    if (!tokenStr) return null;
    
    const token = JSON.parse(tokenStr);
    if (!token || !token.access_token) return null;
    
    return {
      'Authorization': `Bearer ${token.access_token}`
    };
  } catch (error) {
    console.error('解析认证信息失败:', error);
    return null;
  }
} 