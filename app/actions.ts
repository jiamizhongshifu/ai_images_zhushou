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
    console.log('[登录] 清理旧会话');
    await supabase.auth.signOut();
    
    // 增加一个小延迟，确保旧会话完全清除
    await new Promise(resolve => setTimeout(resolve, 300));
    
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
    console.log(`[登录] 会话过期时间: ${new Date(data.session.expires_at || '').toISOString()}`);
    
    // 使用auth.getSession()检查会话状态
    console.log('[登录] 检查会话状态');
    const { data: sessionCheck, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error(`[登录] 检查会话状态失败: ${sessionError.message}`);
    }
    
    console.log(`[登录] 会话检查结果: ${sessionCheck.session ? '有效' : '无效'}`);
    
    if (!sessionCheck.session) {
      // 等待并再次检查
      console.log("[登录] 会话未立即可用，等待后重新检查");
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const { data: secondCheck } = await supabase.auth.getSession();
      console.log(`[登录] 第二次会话检查结果: ${secondCheck.session ? '有效' : '无效'}`);
      
      if (!secondCheck.session) {
        console.error("[登录] 会话创建失败，返回错误");
        return encodedRedirect("error", "/sign-in", "会话创建失败，请尝试使用社交登录或联系管理员");
      }
    }
    
    // 确保cookies已正确设置
    console.log("[登录] 会话验证通过，准备重定向");
  } catch (error) {
    console.error("[登录] 登录过程中出错:", error);
    return encodedRedirect("error", "/sign-in", "登录过程中发生错误，请重试");
  }

  // 添加一个小延迟，确保所有cookie操作已完成
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log("[登录] 重定向到受保护页面");
  
  // 简化URL参数，使用单一auth_session参数代替多个参数
  const authSession = Date.now();
  return redirect(`/protected?auth_session=${authSession}&login_success=true`);
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
