"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const signUpAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  if (!email || !password) {
    return encodedRedirect(
      "error",
      "/sign-up",
      "Email and password are required",
    );
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error(error.code + " " + error.message);
    return encodedRedirect("error", "/sign-up", error.message);
  } else {
    return encodedRedirect(
      "success",
      "/sign-up",
      "Thanks for signing up! Please check your email for a verification link.",
    );
  }
};

// 用于存储已处理的表单Key
const processedFormKeys = new Set<string>();

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const formKey = formData.get("formKey") as string | null;
  
  console.log(`[登录] 尝试登录用户: ${email}, 表单Key: ${formKey?.substring(0, 8) || '无'}`);

  // 检查表单是否已经提交过
  if (formKey && processedFormKeys.has(formKey)) {
    console.log(`[登录] 检测到重复提交，表单Key: ${formKey.substring(0, 8)}, 直接重定向到受保护页面`);
    return redirect("/protected?just_logged_in=true");
  }

  // 记录表单Key为已处理
  if (formKey) {
    processedFormKeys.add(formKey);
    // 限制集合大小，防止内存泄漏
    if (processedFormKeys.size > 100) {
      const iterator = processedFormKeys.values();
      const valueToDelete = iterator.next().value;
      if (valueToDelete !== undefined) {
        processedFormKeys.delete(valueToDelete);
      }
    }
  }

  const supabase = await createClient();

  try {
    if (!email || !password) {
      return encodedRedirect("error", "/sign-in", "请输入邮箱和密码");
    }
    
    // 清理可能存在的旧会话
    await supabase.auth.signOut();
    
    // 增加一个小延迟，确保旧会话完全清除
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('[登录] 尝试调用signInWithPassword');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error(`[登录] 登录失败: ${error.message}`);
      return encodedRedirect("error", "/sign-in", error.message);
    }

    if (!data || !data.session) {
      console.error("[登录] 登录返回的数据中没有会话信息");
      return encodedRedirect("error", "/sign-in", "登录失败：无法创建会话");
    }

    // 登录成功
    console.log(`[登录] 用户 ${email} 登录成功，会话ID: ${data.session.access_token.substring(0, 10)}...`);
    
    // 强制持久化会话数据
    try {
      if (typeof localStorage !== 'undefined') {
        console.log('[登录] 尝试手动保存会话数据到localStorage');
        const sessionKey = 'supabase.auth.token';
        const sessionData = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: Math.floor(new Date(data.session.expires_at || '').getTime() / 1000)
        };
        localStorage.setItem(sessionKey, JSON.stringify(sessionData));
      }
    } catch (storageError) {
      console.warn('[登录] 手动保存会话数据失败，继续后续流程:', storageError);
    }
    
    // 使用auth.getSession()检查会话状态
    console.log('[登录] 检查会话状态');
    const { data: sessionCheck } = await supabase.auth.getSession();
    console.log(`[登录] 会话检查结果: ${sessionCheck.session ? '有效' : '无效'}`);
    
    if (!sessionCheck.session) {
      // 等待并再次检查
      console.log("[登录] 会话未立即可用，等待后重新检查");
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const { data: secondCheck } = await supabase.auth.getSession();
      console.log(`[登录] 第二次会话检查结果: ${secondCheck.session ? '有效' : '无效'}`);
      
      if (!secondCheck.session) {
        console.error("[登录] 会话创建失败，尝试使用低级方法恢复会话");
        
        // 尝试强制设置会话cookie
        try {
          if (typeof document !== 'undefined') {
            const accessToken = data.session.access_token;
            const refreshToken = data.session.refresh_token;
            const expires = new Date(data.session.expires_at || '');
            const maxAge = Math.floor((expires.getTime() - Date.now()) / 1000);
            
            document.cookie = `sb-access-token=${accessToken}; path=/; max-age=${maxAge}; SameSite=Lax`;
            document.cookie = `sb-refresh-token=${refreshToken}; path=/; max-age=${maxAge * 2}; SameSite=Lax`;
            document.cookie = `user_authenticated=true; path=/; max-age=${maxAge}; SameSite=Lax`;
            
            console.log('[登录] 已手动设置会话cookie');
          }
        } catch (cookieError) {
          console.error('[登录] 手动设置cookie失败:', cookieError);
        }
        
        // 再次检查
        await new Promise(resolve => setTimeout(resolve, 500));
        const { data: lastCheck } = await supabase.auth.getSession();
        
        if (!lastCheck.session) {
          console.error("[登录] 所有恢复尝试失败，返回错误");
          return encodedRedirect("error", "/sign-in", "会话创建失败，请重试或清除浏览器缓存后再试");
        }
      }
    }
    
    // 直接在这里清除登出标记cookie
    console.log("[登录] 服务端清除登出标记");
    
    // 设置force_login标记，它会覆盖任何登出标记
    // 注意：这些操作效果会通过重定向参数传递，因为服务器端actions无法直接修改响应cookie
    
    // 确保cookies已正确设置
    console.log("[登录] 会话验证通过，准备重定向");
  } catch (error) {
    console.error("[登录] 登录过程中出错:", error);
    return encodedRedirect("error", "/sign-in", "登录过程中发生错误，请重试");
  }

  // 添加一个小延迟，确保所有cookie操作已完成
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log("[登录] 重定向到受保护页面");
  // 简化URL参数，使用单一auth_session参数代替多个参数
  // 这样可以减少客户端的URL解析负担和页面刷新次数
  const authSession = Date.now();
  return redirect(`/protected?auth_session=${authSession}`);
};

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/protected/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password",
    );
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a link to reset your password.",
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password and confirm password are required",
    );
  }

  if (password !== confirmPassword) {
    encodedRedirect(
      "error",
      "/protected/reset-password",
      "Passwords do not match",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password update failed",
    );
  }

  encodedRedirect("success", "/protected/reset-password", "Password updated");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/sign-in");
};

/**
 * 客户端调用的登出函数
 * 与signOutAction不同，这个函数返回API响应结果而不是重定向
 */
export const handleLogout = async () => {
  try {
    const response = await fetch('/api/auth/signout', {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    
    if (!response.ok) {
      console.error('登出API调用失败，状态码:', response.status);
      throw new Error('登出失败');
    }
    
    const data = await response.json();
    return {
      ...data,
      headers: response.headers
    };
  } catch (error) {
    console.error('登出过程中出错:', error);
    // 即使出错也返回一个对象，包含clearStorage标志
    return {
      success: false,
      error: error instanceof Error ? error.message : '登出时发生错误',
      clearStorage: true
    };
  }
};
