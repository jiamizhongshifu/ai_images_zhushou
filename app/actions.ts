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
      processedFormKeys.delete(iterator.next().value);
    }
  }

  const supabase = await createClient();

  try {
    if (!email || !password) {
      return encodedRedirect("error", "/sign-in", "请输入邮箱和密码");
    }
    
    // 清理可能存在的旧会话
    await supabase.auth.signOut();
    
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
    
    // 使用auth.getSession()检查会话状态
    const { data: sessionCheck } = await supabase.auth.getSession();
    console.log(`[登录] 会话检查结果: ${sessionCheck.session ? '有效' : '无效'}`);
    
    if (!sessionCheck.session) {
      // 等待并再次检查
      console.log("[登录] 会话未立即可用，等待后重新检查");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const { data: secondCheck } = await supabase.auth.getSession();
      console.log(`[登录] 第二次会话检查结果: ${secondCheck.session ? '有效' : '无效'}`);
      
      if (!secondCheck.session) {
        console.error("[登录] 会话创建失败");
        return encodedRedirect("error", "/sign-in", "会话创建失败，请重试");
      }
    }
    
    // 确保cookies已正确设置
    console.log("[登录] 会话验证通过，准备重定向");
  } catch (error) {
    console.error("[登录] 登录过程中出错:", error);
    return encodedRedirect("error", "/sign-in", "登录过程中发生错误，请重试");
  }

  // 添加一个小延迟，确保所有cookie操作已完成
  await new Promise(resolve => setTimeout(resolve, 300));
  console.log("[登录] 重定向到受保护页面");
  // 添加just_logged_in标记和登录时间戳，帮助客户端识别刚登录的状态
  const loginTime = Date.now();
  return redirect(`/protected?just_logged_in=true&login_time=${loginTime}`);
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
